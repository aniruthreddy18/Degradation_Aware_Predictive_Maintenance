"""Train + evaluate every variant (benchmark + ablation) over several seeds.

    python -m app.train --seeds 3 --workers 2

Writes artifacts/runs/<variant>_s<seed>.json (metrics, curves) and the weights of every run.
`python -m app.finalize` then picks the served model by VALIDATION RMSE (never by test score).
"""
from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from . import config as C
from .data import load_test, load_train
from .metrics import evaluate
from .models import build_model
from .pipeline import Scaler, last_windows, make_windows, split_engines

# name -> (architecture, feature set, capped target?)
VARIANTS: dict[str, tuple[str, str, bool]] = {
    "lstm_raw": ("lstm", "raw", True),          # slide 11/12 baseline: LSTM on raw sensors
    "lstm_da": ("lstm", "da", True),            # proposed degradation-aware LSTM
    "lstm_stats": ("lstm", "raw+stats", True),  # ablation: only rolling stats
    "lstm_dyn": ("lstm", "raw+dynamics", True), # ablation: only trend + rate of change
    "gru_da": ("gru", "da", True),
    "cnn_da": ("cnn", "da", True),
    "mlp_da": ("mlp", "da", True),
    "lstm_da_nocap": ("lstm", "da", False),     # ablation: linear (uncapped) RUL target
}
HP = dict(max_epochs=80, patience=12, batch=256, lr=1e-3, wd=1e-4, hidden=64, dropout=0.2)


def predict_np(model: nn.Module, x: np.ndarray, bs: int = 2048) -> np.ndarray:
    model.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(x), bs):
            out.append(model(torch.from_numpy(x[i : i + bs])).numpy())
    return np.concatenate(out) * C.RUL_CAP


def run(variant: str, seed: int, out_dir: Path, keep_weights: bool = True) -> dict:
    arch, fset, capped = VARIANTS[variant]
    torch.set_num_threads(1)
    torch.manual_seed(seed)
    np.random.seed(seed)
    t0 = time.time()

    train_df, (test_df, rul_end) = load_train(), load_test()
    units = np.sort(train_df["unit"].unique())
    tr_i, va_i = split_engines(units, seed)
    tr_units, va_units = units[tr_i], units[va_i]
    df_tr = train_df[train_df["unit"].isin(tr_units)]
    df_va = train_df[train_df["unit"].isin(va_units)]

    scaler = Scaler(C.SENSORS, fset).fit(df_tr)              # fitted on training engines ONLY
    x_tr, y_tr, _ = make_windows(df_tr, scaler)
    x_va, y_va, _ = make_windows(df_va, scaler)
    x_te, te_units = last_windows(test_df, scaler)
    y_te_true = rul_end                                       # RUL at each test engine's last cycle
    y_te_cap = np.minimum(y_te_true, C.RUL_CAP)

    if not capped:                                            # linear target (ablation)
        raw_rul = lambda df: np.concatenate([g["rul"].to_numpy()[C.WINDOW - 1 :] for _, g in df.groupby("unit", sort=True)])
        y_tr, y_va = raw_rul(df_tr).astype(np.float32), raw_rul(df_va).astype(np.float32)
    scale = float(max(y_tr.max(), 1.0)) if not capped else float(C.RUL_CAP)

    model = build_model(arch, x_tr.shape[-1], C.WINDOW, HP["hidden"], HP["dropout"])
    opt = torch.optim.AdamW(model.parameters(), lr=HP["lr"], weight_decay=HP["wd"])
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=4)
    xt, yt = torch.from_numpy(x_tr), torch.from_numpy(y_tr / scale)
    best, best_state, bad, hist = 1e9, None, 0, []

    def _pred(x):  # predictions in cycles, using this run's target scale
        return predict_np(model, x) / C.RUL_CAP * scale

    for ep in range(1, HP["max_epochs"] + 1):
        model.train()
        perm = torch.randperm(len(xt))
        tot = 0.0
        for i in range(0, len(perm), HP["batch"]):
            idx = perm[i : i + HP["batch"]]
            opt.zero_grad()
            loss = nn.functional.mse_loss(model(xt[idx]), yt[idx])
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            tot += loss.item() * len(idx)
        tr_rmse = float(np.sqrt(tot / len(xt)) * scale)
        va_rmse = float(np.sqrt(np.mean((_pred(x_va) - y_va) ** 2)))
        sched.step(va_rmse)
        hist.append({"epoch": ep, "train": round(tr_rmse, 3), "val": round(va_rmse, 3), "lr": opt.param_groups[0]["lr"]})
        if va_rmse < best - 1e-3:
            best, bad = va_rmse, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= HP["patience"]:
                break
    model.load_state_dict(best_state)                        # best-model checkpoint

    pred_te = np.clip(_pred(x_te), 0, None)
    res = {
        "variant": variant, "arch": arch, "feature_set": fset, "capped": capped, "seed": seed,
        "n_params": int(sum(p.numel() for p in model.parameters())),
        "n_channels": int(x_tr.shape[-1]), "epochs_run": len(hist),
        "best_epoch": int(np.argmin([h["val"] for h in hist]) + 1),
        "val_rmse": round(best, 4),
        "test_capped": evaluate(np.minimum(pred_te, C.RUL_CAP), y_te_cap),   # primary (cap-125 convention)
        "test_uncapped": evaluate(pred_te, y_te_true),
        "history": hist, "train_units": tr_units.tolist(), "val_units": va_units.tolist(),
        "seconds": round(time.time() - t0, 1),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{variant}_s{seed}.json").write_text(json.dumps(res))
    if keep_weights:
        torch.save({"state": model.state_dict(), "scaler": scaler.to_dict(), "arch": arch, "scale": scale,
                    "hp": HP, "n_in": x_tr.shape[-1]}, out_dir / f"{variant}_s{seed}.pt")
    return res


def _job(a):
    return run(*a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--variants", nargs="*", default=list(VARIANTS))
    ap.add_argument("--out", default=str(C.ARTIFACT_DIR / "runs"))
    a = ap.parse_args()
    out = Path(a.out)
    jobs = [(v, s, out) for s in range(a.seeds) for v in a.variants]
    with ProcessPoolExecutor(a.workers) as ex:
        for r in ex.map(_job, jobs):
            t = r["test_capped"]
            print(f"{r['variant']:<14} seed{r['seed']} ep{r['epochs_run']:>3} val {r['val_rmse']:.2f} | "
                  f"test RMSE {t['rmse']:.2f} MAE {t['mae']:.2f} score {t['score']:.0f} R2 {t['r2']:.3f} ({r['seconds']}s)", flush=True)


if __name__ == "__main__":
    main()
