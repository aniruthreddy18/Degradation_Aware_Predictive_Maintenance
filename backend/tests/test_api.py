"""API tests run against the real trained artifacts (skipped until `python -m app.finalize` has run)."""
import numpy as np
import pytest

from app import config as C

pytestmark = pytest.mark.skipif(not (C.ARTIFACT_DIR / "model.pt").exists(), reason="no trained artifacts")


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_fleet_is_consistent(client):
    d = client.get("/api/fleet").json()
    s = d["summary"]
    assert s["total"] == 100 == len(d["engines"])
    assert s["healthy"] + s["warning"] + s["critical"] == 100
    for e in d["engines"]:
        assert 0 <= e["predRul"] <= C.RUL_CAP and e["lower"] <= e["predRul"] + 1e-6 <= e["upper"] + 2e-6
        assert e["risk"] == C.risk_of(e["predRul"])
    # served metrics must equal an independent recomputation from the per-engine outputs
    err = np.array([e["predRul"] - e["trueRulCapped"] for e in d["engines"]])
    assert abs(np.sqrt((err**2).mean()) - d["metrics"]["rmse"]) < 0.3     # (rounding to 0.1 cycle in the cache)


def test_engine_detail_and_404(client):
    d = client.get("/api/engines/7").json()
    assert d["engine"]["id"] == 7 and len(d["trajectory"]) == d["engine"]["cycles"] - C.WINDOW + 1
    assert set(d["sensors"]) == set(C.SENSORS)
    assert client.get("/api/engines/999").status_code == 404


def test_predict_matches_cached_fleet_prediction(client):
    """POST /api/predict on an engine's raw history must reproduce the dashboard's number."""
    d = client.get("/api/engines/24").json()
    n = len(d["sensors"][C.SENSORS[0]])
    rows = [{s: d["sensors"][s][i] for s in C.SENSORS} for i in range(n)]
    r = client.post("/api/predict", json={"readings": rows})
    assert r.status_code == 200
    out = r.json()
    assert abs(out["rul"] - d["engine"]["predRul"]) < 0.11 and out["risk"] == d["engine"]["risk"]


def test_predict_validation(client):
    assert client.post("/api/predict", json={"readings": [{"s2": 1.0}] * 5}).status_code == 422        # too short
    bad = [{s: 1.0 for s in C.SENSORS[:-1]}] * C.WINDOW                                                   # missing sensor
    assert client.post("/api/predict", json={"readings": bad}).status_code == 422


def test_predict_flags_out_of_range_input(client):
    d = client.get("/api/engines/3").json()
    rows = [{s: d["sensors"][s][i] for s in C.SENSORS} for i in range(C.WINDOW)]
    for r in rows:
        r["s11"] = 1000.0
    out = client.post("/api/predict", json={"readings": rows}).json()
    assert "s11" in out["out_of_range_sensors"]


def test_api_key_enforced(client, monkeypatch):
    monkeypatch.setattr(C, "API_KEY", "secret")
    d = client.get("/api/engines/3").json()
    rows = [{s: d["sensors"][s][i] for s in C.SENSORS} for i in range(C.WINDOW)]
    assert client.post("/api/predict", json={"readings": rows}).status_code == 401
    assert client.post("/api/predict", json={"readings": rows}, headers={"X-API-Key": "secret"}).status_code == 200


def test_all_read_endpoints_return_valid_json(client):
    """Regression: NaN correlations of constant sensors once made /api/sensors fail JSON encoding."""
    for path in ("/api/sensors", "/api/model", "/api/research", "/api/explain", "/api/schema", "/api/fleet"):
        r = client.get(path)
        assert r.status_code == 200, path
    assert len(client.get("/api/sensors").json()) == 21
