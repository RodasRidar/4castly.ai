APPS_PY := apps/api apps/worker packages/inventory packages/telemetry packages/pgtest

.PHONY: install lint format typecheck test check contracts fixtures modal-requirements dev-web dev-api

install:
	cd apps/web && pnpm install
	@for app in $(APPS_PY); do (cd $$app && uv sync) || exit 1; done

lint:
	cd apps/web && pnpm lint
	@for app in $(APPS_PY); do (cd $$app && uv run ruff check . && uv run ruff format --check .) || exit 1; done

format:
	@for app in $(APPS_PY); do (cd $$app && uv run ruff check --fix . && uv run ruff format .) || exit 1; done

typecheck:
	cd apps/web && pnpm typecheck
	@for app in $(APPS_PY); do (cd $$app && uv run ty check) || exit 1; done

test:
	@for app in $(APPS_PY); do (cd $$app && uv run pytest -q) || exit 1; done

check: lint typecheck test

# OpenAPI -> openapi.json -> apps/web/src/services/http/schema.gen.ts (generated, never hand-edit).
# openapi-typescript runs through `pnpm dlx` at a pinned version, so web dependencies are untouched.
OPENAPI_TS := openapi-typescript@7.13.0

contracts:
	cd apps/api && uv run python -m api.export_openapi --out openapi.json
	cd apps/web && pnpm dlx $(OPENAPI_TS) ../api/openapi.json --root-types -o src/services/http/schema.gen.ts

# Pinned requirements of the Modal image, from the worker lockfile (local-only dependencies excluded).
modal-requirements:
	cd apps/worker && uv export --frozen --no-dev --no-hashes --no-emit-project --no-emit-package castly-inventory --no-emit-package castly-telemetry --no-emit-package castly-pgtest > requirements-modal.txt

# Regenerate the frontend mock fixtures: formulas package -> API schemas -> JSON (generated output).
fixtures:
	cd apps/api && uv run python -m api.mock_fixtures --out ../web/src/services/mock/fixtures

dev-web:
	cd apps/web && pnpm dev

dev-api:
	cd apps/api && uv run uvicorn api.main:app --reload
