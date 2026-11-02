"""Loading the NASA C-MAPSS FD001 files."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C


def _read(name: str) -> pd.DataFrame:
    path = C.DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Run `python scripts/download_data.py` or place the "
            "NASA C-MAPSS FD001 files (train_FD001.txt, test_FD001.txt, RUL_FD001.txt) in the data dir."
        )
    return pd.read_csv(path, sep=r"\s+", header=None, names=C.COLUMNS if "RUL" not in name else ["rul"])


def load_train() -> pd.DataFrame:
    df = _read("train_FD001.txt")
    df["rul"] = df.groupby("unit")["cycle"].transform("max") - df["cycle"]
    return df


def load_test() -> tuple[pd.DataFrame, np.ndarray]:
    """Test engines stop before failure; RUL_FD001.txt gives the true RUL at the last cycle."""
    df = _read("test_FD001.txt")
    rul_end = _read("RUL_FD001.txt")["rul"].to_numpy(dtype=float)
    return df, rul_end
