# 4castly.ai

B2B demand/stock forecasting SaaS. First client: a chemical/pharma importer that exports a printed
"Kardex" Excel report. Upload the report, get cleaned demand series and p10/p50/p90 forecasts per SKU.

## Architecture (hexagonal)

```
 apps/web (React+Vite) --> apps/api (FastAPI) --> Supabase (Postgres, Storage, Auth, pgmq)
                                                        |  ^
                                              dequeue   v  |  save forecasts
                                              apps/worker (Python)
   ingestion adapter  -> cleaning (Polars+Pandera) -> Forecaster port -> ForecastRepository port
   (KardexExcelSource)                                 |- StatsForecastBaseline (SeasonalNaive/AutoETS)
                                                       |- TimesFMForecaster (3.0 local / 2.5 prod)
```

## Local development

```bash
# web (http://localhost:5173)
cd apps/web && cp .env.example .env && pnpm install && pnpm dev     # pnpm build to type-check

# api (http://localhost:8000)
cd apps/api && cp .env.example .env && uv sync && uv run uvicorn api.main:app --reload
cd apps/api && uv run pytest -q

# worker
cd apps/worker && uv sync && uv run pytest -q
cd apps/worker && RUN_TIMESFM=1 uv run pytest -q -k timesfm          # downloads weights

# database: SQL only, in supabase/migrations/ (apply with the Supabase CLI when ready)
```

## Hosting

| | Test phase | Production |
|---|---|---|
| Web + API | Vercel Hobby | Vercel Pro |
| Database / Auth / Storage / Queue | Supabase Free | Supabase Pro |
| Forecast worker | Local Mac (TimesFM 3.0 MLX) or Hugging Face Spaces | Google Cloud Run (TimesFM 2.5, Apache-2.0 weights) or BigQuery ML (TimesFM 3.0, commercial use permitted) |

TimesFM 3.0 downloaded weights are non-commercial: use them for local experiments only.
