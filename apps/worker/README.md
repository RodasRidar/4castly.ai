# apps/worker

Hexagonal Python worker: ingestion adapters, cleaning (Polars + Pandera) and forecasters.

- `domain/` models, `ports/` (`MovementSource`, `Forecaster`, `ForecastRepository`)
- `adapters/ingestion/kardex_excel.py`, `adapters/forecasting/{statsforecast_baseline,timesfm_forecaster}.py`
- `application/cleaning.py`

```bash
uv sync
uv run pytest -q
RUN_TIMESFM=1 uv run pytest -q -k timesfm   # downloads TimesFM 3.0 weights (non-commercial licence)
```

TimesFM 3.0 weights are for local experiments only. Installed with the `timesfm[mlx]` extra (Apple Silicon, no PyTorch).
