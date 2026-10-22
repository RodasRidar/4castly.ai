# 4castly.ai

B2B demand/stock forecasting SaaS. First client: a chemical/pharma importer exporting a printed
"Kardex" Excel report. Upload it, get cleaned demand series and p10/p50/p90 forecasts per SKU.

## Layout

- `apps/web` - React 19 + Vite + TypeScript (pnpm, oxlint, `tsc -b`)
- `apps/api` - FastAPI, thin: upload, parse, CRUD, job enqueueing (uv, package `api`)
- `apps/worker` - forecasting worker (uv, package `worker`)
- `supabase/migrations` - SQL only

## Architecture (worker is hexagonal)

- `domain/`: pure models and rules, no IO or framework imports.
- `ports/`: `typing.Protocol` interfaces (`Forecaster`, `MovementSource`, `ForecastRepository`).
- `application/`: use cases and cleaning; depends on domain and ports only.
- `adapters/`: implement ports (Kardex Excel, statsforecast, TimesFM). Heavy imports stay lazy.
- Dependencies point inward: adapters -> application -> ports -> domain.
- The API stays thin: no forecasting or cleaning logic in routers.

## Commands (run from repo root)

- `make install` - install web and Python deps
- `make lint` / `make format` - oxlint + ruff check/format
- `make typecheck` - `tsc -b` + `ty check`
- `make test` - pytest (api, worker)
- `make check` - everything above; must pass before pushing
- `make dev-web` / `make dev-api` - run dev servers
- Hooks: `prek install` (or `pre-commit install`), config in `.pre-commit-config.yaml`
- Real TimesFM test: `cd apps/worker && RUN_TIMESFM=1 uv run pytest -q -k timesfm`

## Conventions

- Test-first: write the test and observe it fail before fixing or implementing.
- Fix lint/type errors, do not blanket-ignore. Ignores need a short justification comment.
- All code, comments, docs and commit messages are in English (Conventional Commits).
- Never commit client data (`*.xlsx`, `*.xls`, `*.csv`, `.env`); real Kardex files live outside
  the repo. Tests use synthetic workbooks only.
- Manage Python deps with `uv add`, never edit versions by hand or use pip.

## Licensing

TimesFM 3.0 weights are non-commercial: local experiments only. Production uses TimesFM 2.5
(Apache-2.0) or BigQuery ML behind the `Forecaster` port.

## Skills

See `.atl/skill-registry.md` for the available project skills and when to load them.
