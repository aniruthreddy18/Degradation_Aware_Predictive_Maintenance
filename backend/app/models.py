"""Candidate architectures from slide 7 (MLP, 1D-CNN, GRU, LSTM). Same input, same head size."""
from __future__ import annotations

import torch
import torch.nn as nn


class RecurrentRegressor(nn.Module):
    def __init__(self, n_in: int, cell: str = "lstm", hidden: int = 64, layers: int = 2, dropout: float = 0.2):
        super().__init__()
        rnn = {"lstm": nn.LSTM, "gru": nn.GRU}[cell]
        self.rnn = rnn(n_in, hidden, num_layers=layers, batch_first=True, dropout=dropout if layers > 1 else 0.0)
        self.head = nn.Sequential(nn.Linear(hidden, 32), nn.ReLU(), nn.Dropout(dropout), nn.Linear(32, 1))

    def forward(self, x):  # (B, T, C)
        out, _ = self.rnn(x)
        return self.head(out[:, -1]).squeeze(-1)


class CNN1D(nn.Module):
    def __init__(self, n_in: int, hidden: int = 64, dropout: float = 0.2):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(n_in, hidden, 3, padding=1), nn.ReLU(),
            nn.Conv1d(hidden, hidden, 3, padding=1), nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.head = nn.Sequential(nn.Linear(hidden * 2, 32), nn.ReLU(), nn.Dropout(dropout), nn.Linear(32, 1))

    def forward(self, x):
        h = self.conv(x.transpose(1, 2))
        return self.head(torch.cat([h.mean(-1), h[:, :, -1]], dim=1)).squeeze(-1)


class MLP(nn.Module):
    def __init__(self, n_in: int, window: int = 30, hidden: int = 128, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Flatten(), nn.Linear(n_in * window, hidden), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(hidden, 64), nn.ReLU(), nn.Dropout(dropout), nn.Linear(64, 1),
        )

    def forward(self, x):
        return self.net(x).squeeze(-1)


def build_model(arch: str, n_in: int, window: int = 30, hidden: int = 64, dropout: float = 0.2) -> nn.Module:
    if arch in ("lstm", "gru"):
        return RecurrentRegressor(n_in, arch, hidden=hidden, dropout=dropout)
    if arch == "cnn":
        return CNN1D(n_in, hidden=hidden, dropout=dropout)
    if arch == "mlp":
        return MLP(n_in, window, dropout=dropout)
    raise ValueError(arch)
