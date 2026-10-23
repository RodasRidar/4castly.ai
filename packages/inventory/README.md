# packages/inventory

Pure, dependency-free formulas shared by the worker and the API (plan section 6): projected stock,
shortfall, coverage, risk, suggested purchase, buy-before date, ABC, history rules.

```bash
uv sync
uv run pytest -q
uv run python -m inventory.fixtures --out ../../apps/web/src/services/mock/fixtures
```
