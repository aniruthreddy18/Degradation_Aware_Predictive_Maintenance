"""Window-local degradation features.

Every feature is a pure function of the 30-cycle window it belongs to, so training and
serving are identical no matter how much history a client sends (no train/serve skew).
Leading steps are edge-padded (first row repeated).
"""
from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

ROLL = 5       # smoothing / rolling-statistics span (cycles)
TREND = 10     # span of the local linear-trend fit (cycles)
ROC_LAG = 5    # lag for the rate-of-change feature (cycles)

GROUPS = ("raw", "mean", "std", "trend", "roc")  # channel blocks, each of size n_sensors


def _roll(x: np.ndarray, w: int) -> np.ndarray:
    """(N, T, S) -> (N, T, S, w) causal windows with edge padding."""
    xp = np.pad(x, ((0, 0), (w - 1, 0), (0, 0)), mode="edge")
    return sliding_window_view(xp, w, axis=1)


def rolling_mean(x: np.ndarray, w: int = ROLL) -> np.ndarray:
    return _roll(x, w).mean(-1)


def rolling_std(x: np.ndarray, w: int = ROLL) -> np.ndarray:
    return _roll(x, w).std(-1)


def rolling_trend(x: np.ndarray, w: int = TREND) -> np.ndarray:
    """Least-squares slope (per cycle) over the last `w` cycles."""
    t = np.arange(w, dtype=np.float64)
    t -= t.mean()
    return (_roll(x, w) * t).sum(-1) / (t**2).sum()


def rate_of_change(x: np.ndarray, w: int = ROLL, lag: int = ROC_LAG) -> np.ndarray:
    """Change of the smoothed signal over `lag` cycles, per cycle."""
    m = rolling_mean(x, w)
    mp = np.pad(m, ((0, 0), (lag, 0), (0, 0)), mode="edge")[:, :-lag, :]
    return (m - mp) / lag


def build_features(win: np.ndarray, groups: tuple[str, ...]) -> np.ndarray:
    """win: (N, T, S) scaled sensor windows -> (N, T, S * len(groups))."""
    win = win.astype(np.float64)
    fn = {
        "raw": lambda a: a,
        "mean": rolling_mean,
        "std": rolling_std,
        "trend": rolling_trend,
        "roc": rate_of_change,
    }
    return np.concatenate([fn[g](win) for g in groups], axis=-1).astype(np.float32)


def channel_names(sensors: list[str], groups: tuple[str, ...]) -> list[str]:
    return [f"{s}:{g}" for g in groups for s in sensors]
