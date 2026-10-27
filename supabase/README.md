# Supabase

SQL migrations (`migrations/`) are the single source of truth for the schema, RLS, grants, audit and the
signup hook. `config.toml` configures Auth for local development and, through `[remotes.*]`, for hosted
projects. Security-relevant values are pinned by `apps/api/tests/test_supabase_config.py`.

## Tests without Docker

`apps/api/tests/db` starts a throw-away PostgreSQL (`initdb` / `pg_ctl` from the machine), loads a small
Supabase shim (roles, `auth`, `storage`, the hosted default grants) and applies every migration. It proves
zero cross-tenant rows on every table and verb, least-privilege grants, audit, the signup hook and the
`app_api` / `app_worker` roles. A new table must be classified in `test_rls.py` or the suite fails.

```bash
cd apps/api && uv run pytest tests/db -q          # REQUIRE_DB_TESTS=1 turns a missing PostgreSQL into a failure
```

The shim is not Supabase itself: before the first client, also run the suite against a real project
(`supabase start` needs Docker, or a dev project).

## Roles

| Role | Used by | Notes |
|---|---|---|
| `authenticated` | API requests (after `set local role`) and the browser | Only the verbs listed in migration 0002; RLS on every table |
| `app_api` | The API connection | No `BYPASSRLS`, `statement_timeout = 5s`, member of `authenticated` |
| `app_worker` | Modal worker | `BYPASSRLS`; every query filters by the job's tenant |
| `supabase_auth_admin` | GoTrue | May only execute `public.hook_restrict_signup` |

Migration 0003 adds `forecast_runs.pending_params`, the only column of that table users may update
(drawer values waiting for a recalculation).

Migration 0004 closes the findings of the D5 audit: `rate_limits` is read-only for members and moves only
through `rate_limit_hit` / `spend_tokens` (they refuse any connection that is not `app_api`, so PostgREST
callers cannot reset the daily token budget); `audit.log_event` rejects a missing tenant and metadata over
8 KB; `uploads.storage_path` must start with `<tenant_id>/<upload_id>/`; idempotency keys cannot outlive
25 hours or hold a response over 16 KB.

Migration 0002 creates `app_api` and `app_worker` as `NOLOGIN`. For each environment, give them a login
and a password out of band, then use the Supabase pooler URL (transaction mode) in `DATABASE_URL`:

```sql
alter role app_api login password '<generated>';
alter role app_worker login password '<generated>';
```

## Setting up a hosted environment (dev, then prod)

These steps need accounts and credentials, so they are done by a person, not by the repo's tooling:

1. Create the Supabase project (dev first). Check `show server_version;` and align `db.major_version`.
2. **Custom SMTP (S2):** create a Resend account, verify the sending domain (DNS records), create an API key.
   Supabase's default mailer only reaches team members, so every environment a pilot user touches needs this.
3. Fill the `[remotes.dev]` block in `config.toml` (project ref, site URL, redirect URLs) and run, with the
   secrets in the environment: `RESEND_API_KEY=... AUTH_SENDER_EMAIL=... supabase config push --project-ref <ref>`.
4. Apply migrations through CI (`supabase db push`); then set the `app_api` / `app_worker` passwords above.
5. Provision the first tenant and user:

```bash
cd apps/api
PROVISION_DATABASE_URL='postgresql://postgres:...@...:5432/postgres' \
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
uv run python -m api.provisioning --tenant "Company S.A.C." --email person@company.pe --name "Person Name"
```

The script puts the email on the allowlist first (the `before user created` hook rejects anyone else),
creates the confirmed Auth user without sending mail, then adds the membership and profile. Re-running it
is safe. The person then asks for a code on the login screen.
