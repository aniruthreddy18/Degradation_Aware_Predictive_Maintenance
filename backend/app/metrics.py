from __future__ import annotations

import numpy as np


def nasa_score(pred: np.ndarray, true: np.ndarray) -> float:
    """Asymmetric C-MAPSS score: late predictions (pred > true) are penalised more."""
    d = np.asarray(pred, float) - np.asarray(true, float)
    return float(np.sum(np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)))


def evaluate(pred: np.ndarray, true: np.ndarray) -> dict[str, float]:
    pred, true = np.asarray(pred, float), np.asarray(true, float)
    err = pred - true
    ss_res = float(np.sum(err**2))
    ss_tot = float(np.sum((true - true.mean()) ** 2))
    return {
        "rmse": float(np.sqrt(np.mean(err**2))),
        "mae": float(np.mean(np.abs(err))),
        "score": nasa_score(pred, true),
        "r2": 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan"),
    }
