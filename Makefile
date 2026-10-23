APPS_PY := apps/api apps/worker packages/inventory

.PHONY: install lint format typecheck test check fixtures dev-web dev-api

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

# Regenerate the frontend mock fixtures from the formulas package (generated output).
fixtures:
	cd packages/inventory && uv run python -m inventory.fixtures --out ../../apps/web/src/services/mock/fixtures

dev-web:
	cd apps/web && pnpm dev

dev-api:
	cd apps/api && uv run uvicorn api.main:app --reload
