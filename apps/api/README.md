# apps/api

Thin FastAPI service: upload, parse, CRUD and job enqueueing. Heavy work lives in `apps/worker`.

```bash
cp .env.example .env
uv sync
uv run uvicorn api.main:app --reload
uv run pytest -q
```

## How a request is served

`api.auth` verifies the Supabase JWT locally (cached JWKS, `iss`/`aud`/`exp`, asymmetric algorithms only),
resolves the tenant from `tenant_members` (never from the request) and hands routers a `CurrentTx`.
Routers are thin: they call a function in `api/services`, which runs its SQL in one tenant transaction
(`tx.run`), so RLS applies. Outside systems sit behind ports (`api/ports`): the token verifier, object
storage (Supabase Storage) and the job spawner (Modal). Tests inject fakes through `create_app(...)`.

Everything under `/v1` is implemented except the assistant endpoints (`send_message`, `retry_message`,
`submit_feedback`), which answer 501 until phase B5.

Tests under `tests/db/endpoints` run the real app over HTTP against an ephemeral PostgreSQL (see
`supabase/README.md`), with real JWT verification and a new tenant per test.
