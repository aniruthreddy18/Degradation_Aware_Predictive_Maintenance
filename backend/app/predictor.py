"""Inference: loads the served checkpoint and produces RUL + calibrated MC-dropout intervals."""
from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np
import torch

from . import config as C
from .models import build_model
from .pipeline import Scaler


class Predictor:
    def __init__(self, artifact_dir: Path | None = None):
        d = Path(artifact_dir or C.ARTIFACT_DIR)
        ck = torch.load(d / "model.pt", map_location="cpu", weights_only=False)
        self.scaler = Scaler.from_dict(ck["scaler"])
        self.scale = float(ck["scale"])
        hp = ck["hp"]
        self.model = build_model(ck["arch"], ck["n_in"], C.WINDOW, hp["hidden"], hp["dropout"])
        self.model.load_state_dict(ck["state"])
        self.model.eval()
        meta = json.loads((d / "meta.json").read_text())
        self.interval_k = float(meta["interval"]["k"])           # calibrated on validation engines
        self.interval_level = float(meta["interval"]["level"])
        self.meta = meta
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    def _cycles(self, x: np.ndarray) -> np.ndarray:
        return x * (C.RUL_CAP / 1.0) * (self.scale / C.RUL_CAP)

    def point(self, x: np.ndarray, bs: int = 2048) -> np.ndarray:
        """Deterministic prediction (dropout off). x: (N, T, C) model input."""
        self.model.eval()
        out = []
        with torch.no_grad():
            for i in range(0, len(x), bs):
                out.append(self.model(torch.from_numpy(x[i : i + bs])).numpy())
        return np.clip(np.concatenate(out) * self.scale, 0, C.RUL_CAP)

    def mc(self, x: np.ndarray, passes: int = C.MC_PASSES, seed: int = 0, bs: int = 512):
        """MC-dropout: `passes` stochastic forward passes -> (mean, std) in cycles."""
        out = np.zeros((passes, len(x)), dtype=np.float32)
        with self._lock, torch.random.fork_rng(devices=[]):
            torch.manual_seed(seed)
            self.model.train()          # no BatchNorm in any model, so train == eval except dropout
            try:
                with torch.no_grad():
                    for p in range(passes):
                        for i in range(0, len(x), bs):
                            out[p, i : i + bs] = self.model(torch.from_numpy(x[i : i + bs])).numpy()
            finally:
                self.model.eval()
        out = np.clip(out * self.scale, 0, C.RUL_CAP)
        return out.mean(0), out.std(0)

    def interval(self, mean: np.ndarray, std: np.ndarray):
        half = self.interval_k * np.maximum(std, 0.5)
        return np.clip(mean - half, 0, C.RUL_CAP), np.clip(mean + half, 0, C.RUL_CAP)

    # ------------------------------------------------------------------
    def predict_history(self, raw: np.ndarray, passes: int = C.MC_PASSES) -> dict:
        """raw: (T>=30, 14) unscaled sensor history in C.SENSORS order. Uses the last 30 cycles."""
        win = raw[-C.WINDOW :][None]
        x = self.scaler.transform_windows(win)
        _, std = self.mc(x, passes)
        mean = self.point(x)                      # headline RUL = deterministic prediction
        lo, hi = self.interval(mean, std)
        rul = float(mean[0])
        risk = C.risk_of(rul)
        # out-of-distribution guard: share of readings far outside the training range
        span = np.maximum(self.scaler.hi - self.scaler.lo, 1e-9)
        ood = ((win[0] < self.scaler.lo - 0.1 * span) | (win[0] > self.scaler.hi + 0.1 * span)).mean(0)
        return {
            "rul": round(rul, 2), "lower": round(float(lo[0]), 2), "upper": round(float(hi[0]), 2),
            "std": round(float(std[0]), 3), "health": round(100 * rul / C.RUL_CAP, 1),
            "risk": risk, "action": C.action_for(risk),
            "out_of_range_sensors": [s for s, f in zip(self.scaler.sensors, ood) if f > 0.2],
            "model": self.meta["model_id"],
        }
