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

## Jobs and deployment (Modal)

Two job kinds live in the `jobs` table: `digest` (open the file, detect Kardex or tabular, propose the
column mapping, summarise) and `forecast` (clean, forecast, apply the formulas, publish the run). The API
inserts the row and spawns the function by name; handlers are idempotent by job id, so a duplicated or
retried spawn is harmless. A scheduled `respawn_stuck` (every 5 minutes) re-spawns unclaimed or abandoned
jobs, `keepalive_daily` keeps a free Supabase project awake, and `purge_idempotency_daily` deletes expired idempotency keys.

```bash
make modal-requirements                 # refresh requirements-modal.txt after dependency changes
cd apps/worker && uv run modal deploy -m worker.modal_app --env dev
```

Needs a Modal account and a `castly-worker` secret per environment (see `src/worker/modal_app.py`).
TimesFM stays out of the image: `uv sync --group local` for local experiments only (non-commercial
weights, plan 6b).

```bash
uv run pytest -q          # includes tests/db on an ephemeral PostgreSQL; REQUIRE_DB_TESTS=1 fails if missing
```
