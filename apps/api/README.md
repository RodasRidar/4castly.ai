# apps/api

Thin FastAPI service: upload, parse, CRUD and job enqueueing. Heavy work lives in `apps/worker`.

```bash
cp .env.example .env
uv sync
uv run uvicorn api.main:app --reload
uv run pytest -q
```
