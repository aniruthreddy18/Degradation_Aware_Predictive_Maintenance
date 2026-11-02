"""Windowing + leakage-safe scaling shared by training and serving."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from . import config as C
from .features import build_features, channel_names

FEATURE_SETS: dict[str, tuple[str, ...]] = {
    "raw": ("raw",),
    "da": ("raw", "mean", "std", "trend", "roc"),          # full degradation-aware set
    "raw+stats": ("raw", "mean", "std"),                     # ablation: rolling statistics only
    "raw+dynamics": ("raw", "trend", "roc"),                 # ablation: trend + rate of change only
}


@dataclass
class Scaler:
    """Two-stage scaler, fitted on TRAINING engines only.

    1. per-sensor min-max on raw sensor values (before deriving features)
    2. per-channel standardisation of the final feature channels (derived features live on
       very different scales than raw sensors, which LSTMs handle badly)
    """

    sensors: list[str]
    feature_set: str
    lo: np.ndarray = field(default_factory=lambda: np.zeros(0))
    hi: np.ndarray = field(default_factory=lambda: np.ones(0))
    mu: np.ndarray = field(default_factory=lambda: np.zeros(0))
    sd: np.ndarray = field(default_factory=lambda: np.ones(0))

    @property
    def groups(self) -> tuple[str, ...]:
        return FEATURE_SETS[self.feature_set]

    @property
    def channels(self) -> list[str]:
        return channel_names(self.sensors, self.groups)

    def fit(self, train_df: pd.DataFrame) -> "Scaler":
        x = train_df[self.sensors].to_numpy(float)
        self.lo, self.hi = x.min(0), x.max(0)
        wins, _, _ = make_windows(train_df, self, fit=True)
        flat = wins.reshape(-1, wins.shape[-1])
        self.mu, self.sd = flat.mean(0), flat.std(0) + 1e-6
        return self

    def minmax(self, x: np.ndarray) -> np.ndarray:
        return (x - self.lo) / np.maximum(self.hi - self.lo, 1e-9)

    def transform_windows(self, raw_windows: np.ndarray) -> np.ndarray:
        """raw_windows: (N, T, S) unscaled sensor values -> (N, T, C) model input."""
        f = build_features(self.minmax(raw_windows), self.groups)
        return ((f - self.mu) / self.sd).astype(np.float32)

    def to_dict(self) -> dict:
        return {k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in self.__dict__.items()}

    @classmethod
    def from_dict(cls, d: dict) -> "Scaler":
        s = cls(sensors=d["sensors"], feature_set=d["feature_set"])
        for k in ("lo", "hi", "mu", "sd"):
            setattr(s, k, np.asarray(d[k], dtype=np.float64))
        return s


def _unit_windows(x: np.ndarray, window: int) -> np.ndarray:
    """All windows ending at cycles >= window for one engine: (T-window+1, window, S)."""
    from numpy.lib.stride_tricks import sliding_window_view

    return sliding_window_view(x, window, axis=0).transpose(0, 2, 1)


def make_windows(df: pd.DataFrame, scaler: Scaler, fit: bool = False, window: int = C.WINDOW):
    """Return (X, y, unit_ids). With rul column present, y is the capped RUL; else zeros.

    When `fit` is True the scaler's minmax stage is already set and X is returned with only
    minmax + feature derivation (no standardisation) so the second stage can be fitted.
    """
    xs, ys, us = [], [], []
    for unit, g in df.groupby("unit", sort=True):
        raw = g[scaler.sensors].to_numpy(float)
        if len(raw) < window:
            raw = np.vstack([np.repeat(raw[:1], window - len(raw), 0), raw])
            rul = np.zeros(1)
        else:
            rul = g["rul"].to_numpy(float)[window - 1 :] if "rul" in g else np.zeros(len(raw) - window + 1)
        w = _unit_windows(raw, window)
        xs.append(w)
        ys.append(np.minimum(rul, C.RUL_CAP))
        us.append(np.full(len(w), unit))
    raw_w = np.concatenate(xs)
    y = np.concatenate(ys).astype(np.float32)
    u = np.concatenate(us)
    if fit:
        return build_features(scaler.minmax(raw_w), scaler.groups), y, u
    return scaler.transform_windows(raw_w), y, u


def last_windows(df: pd.DataFrame, scaler: Scaler, window: int = C.WINDOW):
    """One window per engine: the final `window` cycles (padded if shorter)."""
    xs, units = [], []
    for unit, g in df.groupby("unit", sort=True):
        raw = g[scaler.sensors].to_numpy(float)[-window:]
        if len(raw) < window:
            raw = np.vstack([np.repeat(raw[:1], window - len(raw), 0), raw])
        xs.append(raw)
        units.append(unit)
    return scaler.transform_windows(np.stack(xs)), np.asarray(units)


def split_engines(units: np.ndarray, seed: int):
    """80/20 split BY ENGINE (slide 10): all windows of an engine stay on one side."""
    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
    tr, va = next(gss.split(units, groups=units))
    return tr, va
