"""FastAPI service: serves the trained model, fleet analytics and a live-prediction endpoint."""
from __future__ import annotations

import hmac
import json
import logging
import time
from contextlib import asynccontextmanager
from functools import lru_cache

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, field_validator

from . import config as C
from .predictor import Predictor

log = logging.getLogger("pm")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


class State:
    predictor: Predictor
    fleet: dict
    sensors_ts: dict
    sensors: list
    results: dict
    explain: dict


S = State()


def _load(name: str):
    return json.loads((C.ARTIFACT_DIR / name).read_text())


@asynccontextmanager
async def lifespan(_: FastAPI):
    missing = [n for n in ("model.pt", "meta.json", "fleet.json", "results.json") if not (C.ARTIFACT_DIR / n).exists()]
    if missing:
        raise RuntimeError(f"Missing artifacts {missing} in {C.ARTIFACT_DIR}. Run `python -m app.train` then `python -m app.finalize`.")
    S.predictor = Predictor()
    S.fleet = _load("fleet.json")
    S.sensors_ts = _load("engine_sensors.json")
    S.sensors = _load("sensors.json")
    S.results = _load("results.json")
    S.explain = _load("explain.json")
    S.fleet["by_id"] = {e["id"]: e for e in S.fleet["engines"]}
    log.info("loaded model %s (%d engines)", S.predictor.meta["model_id"], len(S.fleet["engines"]))
    yield


app = FastAPI(title="Degradation-Aware Predictive Maintenance API", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=C.CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])


@app.middleware("http")
async def timing(request: Request, call_next):
    t = time.perf_counter()
    resp = await call_next(request)
    resp.headers["X-Process-Time-ms"] = f"{(time.perf_counter() - t) * 1000:.1f}"
    return resp


def require_key(x_api_key: str | None = Header(default=None)):
    if C.API_KEY and not (x_api_key and hmac.compare_digest(x_api_key, C.API_KEY)):
        raise HTTPException(401, "Invalid or missing X-API-Key")


# ----------------------------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok", "model": S.predictor.meta["model_id"], "engines": len(S.fleet["engines"]),
            "trained_at": S.results["protocol"]["trained_at"]}


@app.get("/api/fleet")
def fleet():
    eng = S.fleet["engines"]
    n = {r: sum(e["risk"] == r for e in eng) for r in ("Healthy", "Warning", "Critical")}
    return {"summary": {"total": len(eng), **{k.lower(): v for k, v in n.items()},
                        "avgRul": round(float(np.mean([e["predRul"] for e in eng])), 1)},
            "metrics": S.results["served"]["metrics"], "engines": eng}


@app.get("/api/engines/{engine_id}")
def engine(engine_id: int):
    e = S.fleet["by_id"].get(engine_id)
    if not e:
        raise HTTPException(404, f"Engine {engine_id} not found (valid: 1-{len(S.fleet['engines'])})")
    traj = S.fleet["trajectories"][str(engine_id)]
    return {"engine": e,
            "trajectory": [{"cycle": c, "actual": a, "predicted": p, "lower": lo, "upper": hi} for c, a, p, lo, hi in traj],
            "sensors": S.sensors_ts[str(engine_id)]}


@app.get("/api/sensors")
def sensors():
    return S.sensors


@app.get("/api/model")
def model():
    r = S.results
    return {"served": r["served"], "curve": r["curve"], "errorHistogram": r["errorHistogram"], "config": r["config"],
            "protocol": r["protocol"],
            "scatter": [{"trueRul": e["trueRulCapped"], "predRul": e["predRul"]} for e in S.fleet["engines"]]}


@app.get("/api/research")
def research():
    return {"variants": S.results["variants"], "paired": S.results["paired"], "protocol": S.results["protocol"],
            "served": S.results["served"]}


@app.get("/api/explain")
def explain():
    return S.explain


# ---- live inference ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    """History of one engine, oldest first. Each row needs the 14 informative sensors s2,s3,s4,s7,
    s8,s9,s11,s12,s13,s14,s15,s17,s20,s21 (extra keys such as op settings / other sensors are ignored)."""

    readings: list[dict[str, float]] = Field(min_length=C.WINDOW, max_length=C.MAX_PREDICT_ROWS)

    @field_validator("readings")
    @classmethod
    def _check(cls, rows):
        for i, r in enumerate(rows):
            miss = [s for s in C.SENSORS if s not in r]
            if miss:
                raise ValueError(f"row {i}: missing sensors {miss}")
            if any(not np.isfinite(r[s]) for s in C.SENSORS):
                raise ValueError(f"row {i}: non-finite sensor value")
        return rows


@app.post("/api/predict", dependencies=[Depends(require_key)])
def predict(req: PredictRequest):
    raw = np.array([[r[s] for s in C.SENSORS] for r in req.readings], dtype=float)
    out = S.predictor.predict_history(raw)
    out["cycles_received"] = len(raw)
    out["window_used"] = C.WINDOW
    return out


@app.get("/api/schema")
def schema():
    return {"sensors": C.SENSORS, "window": C.WINDOW, "rul_cap": C.RUL_CAP,
            "thresholds": {"healthy_above": C.HEALTHY_ABOVE, "critical_at_most": C.CRITICAL_AT_MOST}}
