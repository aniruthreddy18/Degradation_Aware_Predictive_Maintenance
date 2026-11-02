import numpy as np
import pytest

from app import config as C
from app.features import build_features, rate_of_change, rolling_trend
from app.metrics import evaluate, nasa_score

DATA_OK = (C.DATA_DIR / "train_FD001.txt").exists()


def test_nasa_score_penalises_late_more_than_early():
    assert nasa_score(np.array([60.0]), np.array([50.0])) > nasa_score(np.array([40.0]), np.array([50.0]))
    assert nasa_score(np.array([50.0]), np.array([50.0])) == 0.0


def test_evaluate_perfect_prediction():
    y = np.array([10.0, 50.0, 100.0])
    m = evaluate(y, y)
    assert m["rmse"] == 0 and m["mae"] == 0 and m["r2"] == 1.0


def test_trend_recovers_linear_slope():
    t = np.arange(30, dtype=float)
    x = (3.0 * t + 5.0)[None, :, None]
    tr = rolling_trend(x)
    assert np.allclose(tr[0, 15:, 0], 3.0)           # full-span windows give the exact slope
    assert np.allclose(rate_of_change(x)[0, 10:, 0], 3.0)


def test_features_are_causal():
    """Changing the future must not change features at earlier steps."""
    rng = np.random.default_rng(0)
    a = rng.normal(size=(1, 30, 4))
    b = a.copy()
    b[:, 20:] += 10
    fa = build_features(a, ("raw", "mean", "std", "trend", "roc"))
    fb = build_features(b, ("raw", "mean", "std", "trend", "roc"))
    assert np.allclose(fa[:, :20], fb[:, :20])
    assert fa.shape == (1, 30, 20)


@pytest.mark.skipif(not DATA_OK, reason="FD001 data not downloaded")
def test_fd001_dimensions_and_dropped_sensors():
    from app.data import load_test, load_train

    tr = load_train()
    te, rul = load_test()
    assert tr.shape[0] == 20631 and tr["unit"].nunique() == 100
    assert te.shape[0] == 13096 and len(rul) == 100
    assert (tr[C.DROPPED_SENSORS].std() < 0.05).all()       # truly (near) constant
    assert len(C.SENSORS) == 14


@pytest.mark.skipif(not DATA_OK, reason="FD001 data not downloaded")
def test_split_is_by_engine_and_scaler_uses_train_only():
    from app.data import load_train
    from app.pipeline import Scaler, make_windows, split_engines

    df = load_train()
    units = np.sort(df["unit"].unique())
    tr_i, va_i = split_engines(units, seed=0)
    assert set(units[tr_i]).isdisjoint(units[va_i]) and len(tr_i) == 80 and len(va_i) == 20
    d_tr = df[df["unit"].isin(units[tr_i])]
    sc = Scaler(C.SENSORS, "da").fit(d_tr)
    assert np.allclose(sc.lo, d_tr[C.SENSORS].min().to_numpy())     # statistics come from train engines only
    x, y, u = make_windows(d_tr, sc)
    assert x.shape[1:] == (C.WINDOW, 70) and y.max() <= C.RUL_CAP and set(u) == set(units[tr_i])
    assert abs(x.reshape(-1, 70).mean()) < 0.05                       # standardised on the training windows
