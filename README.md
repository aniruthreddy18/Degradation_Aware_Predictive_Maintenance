# Degradation-Aware Predictive Maintenance — NASA C-MAPSS FD001

Remaining-Useful-Life (RUL) prediction for turbofan engines with a degradation-aware LSTM, a FastAPI
model service and a React dashboard. Everything on the dashboard is computed by the trained model.

```
backend/   Python: data pipeline, training, evaluation, FastAPI service, tests, trained artifacts
src/       TanStack Start / React dashboard (talks to the API through /api)
deploy/    nginx reverse proxy config        docker-compose.yml   one-command deployment
```

## Run it

**Docker (deployment)**
```bash
docker compose up --build        # http://localhost:8080  (nginx -> frontend + /api -> backend)
# optional: PM_API_KEY=secret PM_CORS_ORIGINS=https://your.site docker compose up --build
```

**Local development**
```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000
cd .. && bun install && bun run dev          # /api is proxied to :8000 (VITE_DEV_API_TARGET to change)
```

## Reproduce the model
```bash
cd backend
python scripts/download_data.py                                   # FD001 (NASA, GitHub-mirror fallback), row counts verified
python -m app.train --variants lstm_raw lstm_da --seeds 5          # baseline + proposed
python -m app.train --variants lstm_stats lstm_dyn gru_da cnn_da mlp_da lstm_da_nocap --seeds 3
python -m app.finalize                                             # picks served model, calibrates interval, builds caches
python -m pytest tests -q                                          # 14 tests
```

## What the pipeline does (matches the project presentation)
- 14 informative sensors (7 constant sensors dropped), 30-cycle windows, RUL target capped at 125.
- Degradation features per sensor, computed inside each window: rolling mean, rolling std, local linear trend, rate of change.
- Engine-wise 80/20 split (`GroupShuffleSplit`), scalers fitted on training engines only, early stopping + best checkpoint on validation engines.
- Final score on the official test set at each engine's last cycle against `RUL_FD001.txt`.
- Uncertainty: 50-pass MC dropout; the interval multiplier is **calibrated on validation engines** (raw ±1.96σ badly under-covers).
- Served checkpoint is chosen by **validation** RMSE, never by test score.

## Results (honest summary)
Test RMSE in cycles (cap-125 convention), mean ± std over seeds:

| Model | RMSE | NASA score |
|---|---|---|
| LSTM, raw sensors (baseline, 5 seeds) | 14.05 ± 0.35 | 374 |
| **DA-LSTM, degradation features (5 seeds)** | 14.23 ± 0.42 | 334 |
| LSTM + trend/rate-of-change only (3) | 14.02 ± 0.45 | 365 |
| LSTM + rolling stats only (3) | 16.74 ± 1.75 | 692 |
| MLP / GRU / 1D-CNN on DA features (3 each) | 14.13 / 14.95 / 15.40 | 339 / 410 / 412 |
| DA-LSTM, uncapped linear target (3) | 18.06 ± 1.36 | 1213 |

- **Degradation features did not beat the raw-sensor LSTM** (paired t-test over 5 seeds, p = 0.60). The capped RUL target is the one design choice with a clear, large effect.
- The served checkpoint (`lstm_da_s4`) scores RMSE 13.57 / MAE 10.14 / NASA 283 / R² 0.885 on the test set; it is a good seed — the typical value is the mean above.
- The 95% interval covers 93% of test engines.
- Limitation: FD001 has one operating condition and one fault mode; results may not transfer to FD002–FD004.

## API
`GET /api/health · /fleet · /engines/{id} · /sensors · /model · /research · /explain · /schema`
`POST /api/predict` — body `{"readings": [{"s2":…, "s3":…, … 14 sensors}, … ≥30 rows]}` → RUL, 95% interval, risk, action,
out-of-range sensor flags. Set `PM_API_KEY` to require an `X-API-Key` header.
Risk tiers: RUL > 80 Healthy · 30–80 Warning · ≤ 30 Critical.
