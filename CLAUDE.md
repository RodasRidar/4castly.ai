# 4castly.ai

B2B demand/stock forecasting SaaS. First client: a chemical/pharma importer exporting a printed
"Kardex" Excel report. Upload it, get cleaned demand series and p10/p50/p90 forecasts per SKU.

## Layout

- `apps/web` - React 19 + Vite + TypeScript (pnpm, oxlint, `tsc -b`)
- `apps/api` - FastAPI, thin: upload, parse, CRUD, job enqueueing (uv, package `api`)
- `apps/worker` - forecasting worker (uv, package `worker`)
- `packages/inventory` - pure inventory formulas shared by worker and API (uv, package `inventory`)
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
- `make test` - pytest (api, worker, inventory); api includes `tests/db`, RLS tests on an ephemeral
  PostgreSQL (no Docker; see `supabase/README.md`). `REQUIRE_DB_TESTS=1` fails instead of skipping
- `make check` - everything above; must pass before pushing
- `make contracts` - export `apps/api/openapi.json` and regenerate `apps/web/src/services/http/schema.gen.ts` (CI fails on drift)
- `make fixtures` - regenerate `apps/web/src/services/mock/fixtures/` through the API schemas (generated, never hand-edit)
- `make dev-web` / `make dev-api` - run dev servers
- Hooks: `prek install` (or `pre-commit install`), config in `.pre-commit-config.yaml`
- Worker deploy: `make modal-requirements`, then `cd apps/worker && uv run modal deploy -m worker.modal_app --env dev`
  (see `apps/worker/README.md`). TimesFM is local-only: `uv sync --group local`.
- Real TimesFM test: `cd apps/worker && RUN_TIMESFM=1 uv run pytest -q -k timesfm`

## Conventions

- Test-first: write the test and observe it fail before fixing or implementing.
- Fix lint/type errors, do not blanket-ignore. Ignores need a short justification comment.
- All code, comments, docs and commit messages are in English (Conventional Commits).
- Never commit client data (`*.xlsx`, `*.xls`, `*.csv`, `.env`); real Kardex files live outside
  the repo. Tests use synthetic workbooks only.
- Manage Python deps with `uv add`, never edit versions by hand or use pip.
- Every new table in `public` gets RLS, least-privilege grants and an entry in `apps/api/tests/db/test_rls.py`
  (the suite fails on an unclassified table). Migrations are SQL only, numbered `NNNN_name.sql`.
- Provision tenants/users with `cd apps/api && uv run python -m api.provisioning --help`.

## Licensing

TimesFM 3.0 weights are non-commercial. They are allowed for local experiments and for the
non-commercial pilot (primary model, with statsforecast AutoETS as baseline and fallback). Replacing
them (TimesFM 2.5 Apache-2.0, BigQuery ML, or another model behind the `Forecaster` port) is a release
gate before any commercial use. See `docs/plan-implementacion.md` section 6b.

## Skills

See `.atl/skill-registry.md` for the available project skills and when to load them.
