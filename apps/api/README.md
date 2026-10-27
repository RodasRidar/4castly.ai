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

Every operation under `/v1` is implemented.

Tests under `tests/db/endpoints` run the real app over HTTP against an ephemeral PostgreSQL (see
`supabase/README.md`), with real JWT verification and a new tenant per test.

## The assistant

`POST /v1/conversations/{id}/messages` streams the answer as server-sent events. An `AssistantAgent`
(port; `api/adapters/anthropic_agent.py` on `claude-sonnet-5-5`) runs a tool loop over six read-only
tools (`api/services/assistant_tools.py`). The model never writes a number: tools return figures with
ids and the model writes `[[f7_3]]`; `api/assistant/guard.py` swaps in the exact value for the user's
locale and masks any digit the model writes on its own. History is append-only (`messages.blocks`
replayed unchanged; context changes and retries are hidden `system` rows). Without `ANTHROPIC_API_KEY`
the chat answers 503. With Langfuse keys, LLM spans (with prompts) go to Langfuse and the same spans
reach Axiom without them; votes become Langfuse scores.

For the full local stack (Supabase, worker, TimesFM) see [`docs/desarrollo-local.md`](../../docs/desarrollo-local.md).
