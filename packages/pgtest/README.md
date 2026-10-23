# packages/pgtest

Test helper shared by `apps/api` and `apps/worker`: starts a throw-away PostgreSQL (`initdb` / `pg_ctl` from the
machine, no Docker), loads a minimal Supabase shim (roles, `auth`, `storage`, hosted default grants) and
applies the SQL migrations. It is a dev dependency only and never ships.
