"""Pick the served model, calibrate uncertainty, precompute dashboard caches + explainability.

    python -m app.finalize
"""
from __future__ import annotations

import glob
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from scipy import stats

from . import config as C
from .data import load_test, load_train
from .metrics import evaluate
from .pipeline import Scaler, last_windows, make_windows
from .predictor import Predictor
from .train import HP, VARIANTS

LEVEL = 0.95


def _load_runs(runs: Path) -> list[dict]:
    return [json.loads(Path(p).read_text()) for p in sorted(glob.glob(str(runs / "*.json")))]


def aggregate(runs: list[dict]) -> dict:
    out = {}
    for v in VARIANTS:
        rs = [r for r in runs if r["variant"] == v]
        if not rs:
            continue
        row = {"variant": v, "arch": rs[0]["arch"], "feature_set": rs[0]["feature_set"], "capped": rs[0]["capped"],
               "n_seeds": len(rs), "n_params": rs[0]["n_params"], "n_channels": rs[0]["n_channels"]}
        for m in ("rmse", "mae", "score", "r2"):
            vals = np.array([r["test_capped"][m] for r in rs])
            row[m] = round(float(vals.mean()), 3)
            row[m + "_std"] = round(float(vals.std(ddof=1)) if len(vals) > 1 else 0.0, 3)
            row[m + "_runs"] = [round(float(x), 3) for x in vals]
        row["rmse_uncapped"] = round(float(np.mean([r["test_uncapped"]["rmse"] for r in rs])), 3)
        row["val_rmse"] = round(float(np.mean([r["val_rmse"] for r in rs])), 3)
        row["epochs"] = round(float(np.mean([r["epochs_run"] for r in rs])), 1)
        out[v] = row
    return out


def paired_test(runs, a, b):
    """Paired t-test on test RMSE between two variants over shared seeds (same engine split per seed)."""
    ra = {r["seed"]: r["test_capped"]["rmse"] for r in runs if r["variant"] == a}
    rb = {r["seed"]: r["test_capped"]["rmse"] for r in runs if r["variant"] == b}
    seeds = sorted(set(ra) & set(rb))
    if len(seeds) < 3:
        return None
    x, y = np.array([ra[s] for s in seeds]), np.array([rb[s] for s in seeds])
    t, p = stats.ttest_rel(x, y)
    return {"a": a, "b": b, "n": len(seeds), "mean_diff": round(float((x - y).mean()), 3), "t": round(float(t), 3), "p": round(float(p), 4)}


def main(artifact_dir: Path = C.ARTIFACT_DIR):
    runs_dir = artifact_dir / "runs"
    runs = _load_runs(runs_dir)
    agg = aggregate(runs)

    # --- choose the served model by VALIDATION rmse (test set is never used for selection) --------
    cand = [r for r in runs if r["variant"] == "lstm_da"]
    best = min(cand, key=lambda r: r["val_rmse"])
    tag = f"lstm_da_s{best['seed']}"
    shutil.copy(runs_dir / f"{tag}.pt", artifact_dir / "model.pt")
    print("served model:", tag, "val rmse", best["val_rmse"])

    ck = torch.load(artifact_dir / "model.pt", map_location="cpu", weights_only=False)
    # provisional meta so Predictor can load before calibration
    (artifact_dir / "meta.json").write_text(json.dumps({"interval": {"k": 1.0, "level": LEVEL}, "model_id": tag}))
    P = Predictor(artifact_dir)
    scaler = P.scaler

    train_df, (test_df, rul_end) = load_train(), load_test()
    df_va = train_df[train_df["unit"].isin(best["val_units"])]
    x_va, y_va, _ = make_windows(df_va, scaler)

    # --- calibrate the MC-dropout interval on validation engines ----------------------------------
    _, s = P.mc(x_va, seed=1)
    z = np.abs(y_va - P.point(x_va)) / np.maximum(s, 0.5)   # interval is centred on the deterministic prediction
    k = float(np.quantile(z, LEVEL))
    print(f"interval multiplier k={k:.2f} (raw 1.96 -> calibrated {k:.2f})")
    meta = {"interval": {"k": round(k, 4), "level": LEVEL, "method": "MC dropout (50 passes), k calibrated on validation engines"},
            "model_id": tag}
    (artifact_dir / "meta.json").write_text(json.dumps(meta))
    P = Predictor(artifact_dir)

    # --- test-set evaluation of the served model -------------------------------------------------
    x_te, te_units = last_windows(test_df, scaler)
    _, s_te = P.mc(x_te, seed=2)
    y_cap = np.minimum(rul_end, C.RUL_CAP)
    p_pt = P.point(x_te)
    lo_te, hi_te = P.interval(p_pt, s_te)
    served = {"capped": evaluate(p_pt, y_cap), "uncapped": evaluate(p_pt, rul_end),
              "interval_coverage_test": round(float(np.mean((y_cap >= lo_te) & (y_cap <= hi_te))), 3),
              "interval_mean_width": round(float(np.mean(hi_te - lo_te)), 2)}
    print("served test:", {k_: round(v, 3) for k_, v in served["capped"].items()}, "coverage", served["interval_coverage_test"])

    # --- fleet + per-engine trajectories (prediction at every cycle >= WINDOW, history only) -------
    fleet, traj, sensors_ts = [], {}, {}
    for unit, g in test_df.groupby("unit", sort=True):
        raw = g[C.SENSORS].to_numpy(float)
        T = len(raw)
        from .pipeline import _unit_windows
        wins = _unit_windows(raw, C.WINDOW)
        x = scaler.transform_windows(wins)
        _, ss = P.mc(x, seed=3)
        mm = P.point(x)
        lo, hi = P.interval(mm, ss)
        cyc = np.arange(C.WINDOW, T + 1)
        true_c = np.minimum(rul_end[unit - 1] + (T - cyc), C.RUL_CAP)
        traj[int(unit)] = [[int(c), round(float(a), 1), round(float(b), 1), round(float(l), 1), round(float(h), 1)]
                           for c, a, b, l, h in zip(cyc, true_c, mm, lo, hi)]
        sensors_ts[int(unit)] = {s_: [round(float(v), 3) for v in g[s_]] for s_ in C.SENSORS}
        pred_last = float(mm[-1])
        risk = C.risk_of(pred_last)
        fleet.append({"id": int(unit), "cycles": int(T), "trueRul": float(rul_end[unit - 1]),
                      "trueRulCapped": float(min(rul_end[unit - 1], C.RUL_CAP)),
                      "predRul": round(pred_last, 1), "lower": round(float(lo[-1]), 1), "upper": round(float(hi[-1]), 1),
                      "health": round(100 * pred_last / C.RUL_CAP, 1), "risk": risk, "action": C.action_for(risk)})
    json.dump({"engines": fleet, "trajectories": traj}, open(artifact_dir / "fleet.json", "w"))
    json.dump(sensors_ts, open(artifact_dir / "engine_sensors.json", "w"))

    # --- sensor catalogue (computed from the training set) ----------------------------------------
    rows = []
    for sname in C.ALL_SENSORS:
        v = train_df[sname]
        kept = sname in C.SENSORS
        corr = float(train_df[[sname, "rul"]].assign(rul=np.minimum(train_df["rul"], C.RUL_CAP)).corr(method="spearman").iloc[0, 1]) if v.std() > 1e-6 else 0.0
        sym, desc, unit = C.SENSOR_INFO[sname]
        rows.append({"key": sname, "symbol": sym, "name": desc, "unit": unit, "kept": kept, "std": round(float(v.std()), 5),
                     "mean": round(float(v.mean()), 4), "corrRul": round(corr, 3),
                     "trend": "up" if corr < 0 else "down"})
    json.dump(rows, open(artifact_dir / "sensors.json", "w"))

    # --- explainability: permutation importance + time-step saliency ------------------------------
    rng = np.random.default_rng(0)
    base = float(np.sqrt(np.mean((P.point(x_va) - np.minimum(y_va, C.RUL_CAP)) ** 2)))
    S, G = len(C.SENSORS), len(scaler.groups)
    def perm_rmse(chans, reps=5):
        vals = []
        for _ in range(reps):
            xp = x_va.copy()
            idx = rng.permutation(len(xp))
            xp[:, :, chans] = x_va[idx][:, :, chans]
            vals.append(np.sqrt(np.mean((P.point(xp) - np.minimum(y_va, C.RUL_CAP)) ** 2)))
        return float(np.mean(vals)) - base
    sens_imp = []
    for i, sname in enumerate(C.SENSORS):
        chans = [g * S + i for g in range(G)]
        sym = C.SENSOR_INFO[sname][0]
        sens_imp.append({"sensor": f"{sname} {sym}", "key": sname, "value": round(perm_rmse(chans), 3)})
    sens_imp.sort(key=lambda d: -d["value"])
    group_imp = [{"group": g, "value": round(perm_rmse([gi * S + i for i in range(S)]), 3)} for gi, g in enumerate(scaler.groups)]

    xt = torch.from_numpy(x_te.copy()).requires_grad_(True)
    P.model.eval()
    P.model(xt).sum().backward()
    sal = (xt.grad * xt).abs().mean(dim=(0, 2)).detach().numpy()
    sal = sal / sal.sum()
    explain = {"method": "permutation importance on validation engines (RMSE increase in cycles, 5 repeats); "
                         "input×gradient saliency over the 30-cycle window on the 100 test engines",
               "baseline_val_rmse": round(base, 3), "sensors": sens_imp, "groups": group_imp,
               "time": [{"step": f"t-{C.WINDOW - 1 - i}", "weight": round(float(w), 4)} for i, w in enumerate(sal)]}
    json.dump(explain, open(artifact_dir / "explain.json", "w"))

    # --- results bundle for the dashboard ----------------------------------------------------------
    err = np.asarray([e["predRul"] - e["trueRulCapped"] for e in fleet])
    bins = list(range(-40, 41, 8))
    hist = [{"bin": f"{a}", "count": int(((err >= a) & (err < a + 8)).sum())} for a in bins[:-1]]
    hist[0]["count"] += int((err < -40).sum()); hist[-1]["count"] += int((err >= 40).sum())
    curve = best["history"]
    paired = [paired_test(runs, "lstm_raw", "lstm_da")]
    cfg = {"architecture": f"{best['arch'].upper()} 2×64 + MLP head (64→32→1)", "window": C.WINDOW, "rul_cap": C.RUL_CAP,
           "features": f"{len(C.SENSORS)} sensors × {len(scaler.groups)} blocks = {best['n_channels']} channels ({', '.join(scaler.groups)})",
           "optimizer": f"AdamW lr {HP['lr']}, wd {HP['wd']}, ReduceLROnPlateau", "batch": HP["batch"], "dropout": HP["dropout"],
           "loss": "MSE on RUL/125", "early_stopping": f"patience {HP['patience']}, best-val checkpoint", "params": best["n_params"]}
    n_runs = len(runs)
    results = {
        "served": {"id": tag, "seed": best["seed"], "val_rmse": best["val_rmse"], "metrics": served["capped"],
                   "metrics_uncapped": served["uncapped"], "coverage": served["interval_coverage_test"],
                   "interval_width": served["interval_mean_width"], "interval_k": meta["interval"]["k"], "level": LEVEL},
        "variants": agg, "paired": [p for p in paired if p], "curve": curve, "errorHistogram": hist, "config": cfg,
        "protocol": {"train_engines": len(best["train_units"]), "val_engines": len(best["val_units"]), "n_runs": n_runs,
                     "seeds": sorted({r["seed"] for r in runs}), "splitter": "GroupShuffleSplit(test_size=0.2) by engine id",
                     "scaler": "fitted on training engines only", "test": "official RUL_FD001 at each test engine's last cycle",
                     "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "data": "NASA C-MAPSS FD001"},
    }
    json.dump(results, open(artifact_dir / "results.json", "w"))
    print("wrote artifacts:", sorted(p.name for p in artifact_dir.glob("*.json")))


if __name__ == "__main__":
    main()
