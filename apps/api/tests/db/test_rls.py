"""Tenant isolation, least privilege and audit, checked against a real PostgreSQL (plan 5, S8).

The table lists below are a fail-closed registry: a table added to `public` without being
classified here fails `test_every_table_is_classified`, so no table ships without a decision.
"""

from __future__ import annotations

import json
from uuid import uuid4

import psycopg
import psycopg.types.json
import pytest
from psycopg import errors as pg

from .conftest import DictConnection, acting, q
from .seed import Seed

# Tables the browser/API may only read (the worker or SQL functions write them).
READ_ONLY = {
    "tenants",
    "tenant_members",
    "products",
    "movements",
    "demand_series",
    "sales",
    "job_events",
    "forecast_runs",
    "forecasts",
    "run_product_metrics",
    "rate_limits",  # counters move only through the definer functions of migration 0004
}
# Tenant-scoped tables the API writes as the user, with the verbs it is given.
WRITABLE = {
    "conversations": {"insert", "update"},
    "uploads": {"insert", "update"},
    "normalization_plans": {"insert", "update"},
    "jobs": {"insert", "update"},
    "idempotency_keys": {"insert"},
    "product_overrides": {"insert", "update", "delete"},
    "messages": {"insert"},
    "message_feedback": {"insert", "update", "delete"},
}
OWNER_ONLY = {"profiles"}
SERVER_ONLY = {"allowed_emails"}
AUDIT_TABLES = {"log_entries", "events"}
NO_TENANT_COLUMN = {"tenants", "profiles"}
IDENTITY_TABLES = {"movements", "forecasts", "sales", "job_events", "messages"}

ALL_TABLES = READ_ONLY | set(WRITABLE) | OWNER_ONLY | SERVER_ONLY
DENIED = (pg.InsufficientPrivilege,)


def tenant_filter(table: str) -> str:
    return "id" if table == "tenants" else "tenant_id"


def public_tables(conn: DictConnection) -> set[str]:
    rows = conn.execute(
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind in ('r', 'p')"
    ).fetchall()
    return {r["relname"] for r in rows}


def test_every_table_is_classified(conn: DictConnection) -> None:
    assert public_tables(conn) == ALL_TABLES


def test_every_public_table_has_rls_and_a_tenant_column(conn: DictConnection) -> None:
    rows = conn.execute(
        "select c.relname, c.relrowsecurity, exists (select 1 from pg_attribute a "
        "where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped) "
        "as has_tenant "
        "from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind in ('r', 'p')"
    ).fetchall()

    for row in rows:
        assert row["relrowsecurity"], row["relname"]
        assert row["has_tenant"] or row["relname"] in NO_TENANT_COLUMN, row["relname"]


def test_legacy_tables_are_gone(conn: DictConnection) -> None:
    tables = public_tables(conn)

    assert "skus" not in tables
    assert "forecast_jobs" not in tables


@pytest.mark.parametrize("table", sorted(ALL_TABLES))
def test_anon_has_no_access(conn: DictConnection, table: str) -> None:
    with acting(conn, None, role="anon"), pytest.raises(DENIED), conn.transaction():
        conn.execute(q("select 1 from public.{table} limit 1", table=table))


@pytest.mark.parametrize("table", sorted((READ_ONLY | set(WRITABLE)) - {"tenants"}))
def test_user_sees_only_their_own_tenant(conn: DictConnection, seed: Seed, table: str) -> None:
    with acting(conn, seed.a.user):
        own = conn.execute(
            q("select count(*) as n from public.{table} where tenant_id = %s", table=table),
            [seed.a.tenant],
        ).fetchone()
        other = conn.execute(
            q("select count(*) as n from public.{table} where tenant_id = %s", table=table),
            [seed.b.tenant],
        ).fetchone()
        everything = conn.execute(
            q("select count(*) as n from public.{table}", table=table)
        ).fetchone()

    assert own is not None
    assert other is not None
    assert everything is not None
    assert own["n"] >= 1, "positive control: the user must see their own rows"
    assert other["n"] == 0
    assert everything["n"] == own["n"]


def test_tenants_and_members_are_visible_only_for_the_users_own_tenant(
    conn: DictConnection, seed: Seed
) -> None:
    with acting(conn, seed.a.user):
        tenants = conn.execute("select id from public.tenants").fetchall()
        members = conn.execute("select user_id from public.tenant_members").fetchall()

    assert {t["id"] for t in tenants} == {seed.a.tenant}
    assert {m["user_id"] for m in members} == {seed.a.user}  # members see themselves only


def test_profiles_are_owner_only_even_inside_one_tenant(conn: DictConnection, seed: Seed) -> None:
    with acting(conn, seed.a.user):
        visible = conn.execute("select user_id from public.profiles").fetchall()
    with acting(conn, seed.a2_user):
        second = conn.execute("select user_id from public.profiles").fetchall()

    assert {r["user_id"] for r in visible} == {seed.a.user}
    assert {r["user_id"] for r in second} == {seed.a2_user}


def test_profiles_cannot_be_written_for_someone_else(conn: DictConnection, seed: Seed) -> None:
    with acting(conn, seed.a.user):
        own = conn.execute(
            "update public.profiles set job_title = 'Jefa' where user_id = %s", [seed.a.user]
        )
        other = conn.execute(
            "update public.profiles set job_title = 'x' where user_id = %s", [seed.b.user]
        )
        with pytest.raises(DENIED), conn.transaction():
            conn.execute(
                "insert into public.profiles (user_id, full_name) values (%s, 'Mallory')",
                [seed.b.user],
            )

    assert own.rowcount == 1
    assert other.rowcount == 0


@pytest.mark.parametrize("table", sorted(SERVER_ONLY))
def test_server_only_tables_are_closed_to_users(
    conn: DictConnection, seed: Seed, table: str
) -> None:
    with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
        conn.execute(q("select 1 from public.{table}", table=table))


def fetch_row(conn: DictConnection, table: str, tenant: object) -> dict:
    column = tenant_filter(table)
    row = conn.execute(
        q(
            "select to_jsonb(t) as j from public.{table} t where {column} = %s limit 1",
            table=table,
            column=column,
        ),
        [tenant],
    ).fetchone()
    assert row is not None, table
    return row["j"]


@pytest.mark.parametrize("table", sorted(ALL_TABLES - OWNER_ONLY - {"tenants"}))
def test_user_cannot_insert_into_another_tenant(
    conn: DictConnection, seed: Seed, table: str
) -> None:
    template = fetch_row(conn, table, seed.b.tenant)
    # Identity columns are `generated always`: copying a row needs OVERRIDING SYSTEM VALUE.
    sql = (
        "insert into public.{table} overriding system value "
        "select * from jsonb_populate_record(null::public.{table}, %s::jsonb)"
        if table in IDENTITY_TABLES
        else "insert into public.{table} "
        "select * from jsonb_populate_record(null::public.{table}, %s::jsonb)"
    )

    with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
        conn.execute(
            q(sql, table=table),
            [psycopg.types.json.Jsonb(template)],
        )


@pytest.mark.parametrize("table", sorted(ALL_TABLES - OWNER_ONLY - {"tenants"}))
def test_user_cannot_update_or_delete_another_tenants_rows(
    conn: DictConnection, seed: Seed, table: str
) -> None:
    with acting(conn, seed.a.user):
        for statement in (
            q("update public.{table} set tenant_id = tenant_id where tenant_id = %s", table=table),
            q("delete from public.{table} where tenant_id = %s", table=table),
        ):
            try:
                with conn.transaction():
                    result = conn.execute(statement, [seed.b.tenant])
            except DENIED:
                continue  # no privilege at all: also isolation
            assert result.rowcount == 0, statement

    survivors = conn.execute(
        q("select count(*) as n from public.{table} where tenant_id = %s", table=table),
        [seed.b.tenant],
    ).fetchone()
    assert survivors is not None
    assert survivors["n"] >= 1


@pytest.mark.parametrize("table", sorted(t for t, v in WRITABLE.items() if "update" in v))
def test_user_cannot_move_a_row_to_another_tenant(
    conn: DictConnection, seed: Seed, table: str
) -> None:
    with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
        conn.execute(
            q("update public.{table} set tenant_id = %s where tenant_id = %s", table=table),
            [seed.b.tenant, seed.a.tenant],
        )


def test_privileges_match_the_declared_verbs(conn: DictConnection) -> None:
    for table in ALL_TABLES - OWNER_ONLY - SERVER_ONLY:
        allowed = WRITABLE.get(table, set())
        for verb in ("insert", "update", "delete"):
            has = conn.execute(
                "select has_table_privilege('authenticated', %s, %s) as ok",
                [f"public.{table}", verb],
            ).fetchone()
            assert has is not None
            assert has["ok"] == (verb in allowed), (table, verb)


def test_composite_foreign_keys_block_cross_tenant_references(
    conn: DictConnection, seed: Seed
) -> None:
    upload = uuid4()
    with pytest.raises(pg.ForeignKeyViolation), conn.transaction():
        conn.execute(
            "insert into public.uploads (id, tenant_id, conversation_id, created_by, storage_path, "
            "file_name, size_bytes, content_type, status) values (%s, %s, %s, %s, %s, 'f.xlsx', 1, "
            "'text/csv', 'pending')",
            [
                upload,
                seed.a.tenant,
                seed.b.conversation,
                seed.a.user,
                f"{seed.a.tenant}/{upload}/f",
            ],
        )
    with pytest.raises(pg.ForeignKeyViolation), conn.transaction():
        conn.execute(
            "insert into public.movements (tenant_id, product_id, occurred_at) "
            "values (%s, %s, now())",
            [seed.a.tenant, seed.b.product],
        )


def test_only_one_active_job_per_conversation(conn: DictConnection, seed: Seed) -> None:
    conn.execute(
        "insert into public.jobs (tenant_id, conversation_id, kind, status) "
        "values (%s, %s, 'forecast', 'running')",
        [seed.a.tenant, seed.a.conversation],
    )

    with pytest.raises(pg.UniqueViolation), conn.transaction():
        conn.execute(
            "insert into public.jobs (tenant_id, conversation_id, kind, status) "
            "values (%s, %s, 'digest', 'queued')",
            [seed.a.tenant, seed.a.conversation],
        )
    # Finished jobs do not count.
    conn.execute(
        "insert into public.jobs (tenant_id, conversation_id, kind, status) "
        "values (%s, %s, 'digest', 'failed')",
        [seed.a.tenant, seed.a.conversation],
    )


def test_one_tenant_per_user_and_one_tenant_per_email(conn: DictConnection, seed: Seed) -> None:
    with pytest.raises(pg.UniqueViolation), conn.transaction():
        conn.execute(
            "insert into public.tenant_members (tenant_id, user_id) values (%s, %s)",
            [seed.b.tenant, seed.a.user],
        )
    with pytest.raises(pg.UniqueViolation), conn.transaction():
        conn.execute(
            "insert into public.allowed_emails (tenant_id, email) values (%s, 'ANA@example.com')",
            [seed.b.tenant],
        )


class TestAudit:
    def test_changes_on_configuration_tables_are_logged_with_actor_and_request(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with acting(conn, seed.a.user, request_id="req-42"):
            conn.execute(
                "update public.conversations set title = 'Renombrada' where id = %s",
                [seed.a.conversation],
            )

        entry = conn.execute(
            "select * from audit.log_entries where table_name = 'conversations' "
            "order by id desc limit 1"
        ).fetchone()
        assert entry is not None
        assert entry["op"] == "UPDATE"
        assert entry["tenant_id"] == seed.a.tenant
        assert entry["actor_id"] == seed.a.user
        assert entry["request_id"] == "req-42"
        assert entry["row_pk"] == str(seed.a.conversation)
        assert entry["changed_fields"] == ["title"]
        assert entry["old"]["title"] == "Kardex A"
        assert entry["new"]["title"] == "Renombrada"

    def test_member_changes_are_logged_with_a_composite_key(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        conn.execute(
            "update public.tenant_members set role = 'admin' where user_id = %s", [seed.a2_user]
        )

        entry = conn.execute(
            "select row_pk, changed_fields from audit.log_entries "
            "where table_name = 'tenant_members' order by id desc limit 1"
        ).fetchone()
        assert entry == {
            "row_pk": f"{seed.a.tenant}:{seed.a2_user}",
            "changed_fields": ["role"],
        }

    def test_bulk_fact_tables_are_not_row_audited(self, conn: DictConnection, seed: Seed) -> None:
        conn.execute("update public.forecasts set p50 = 11 where tenant_id = %s", [seed.a.tenant])

        audited = conn.execute(
            "select count(*) as n from audit.log_entries where table_name = 'forecasts'"
        ).fetchone()
        assert audited == {"n": 0}

    def test_business_events_record_actor_and_request(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with acting(conn, seed.a.user, request_id="req-9"):
            conn.execute(
                "select audit.log_event(%s, 'export.created', 'run', %s, %s::jsonb)",
                [seed.a.tenant, str(seed.a.run), '{"rows": 26}'],
            )

        event = conn.execute("select * from audit.events order by id desc limit 1").fetchone()
        assert event is not None
        assert (event["action"], event["actor_id"], event["request_id"]) == (
            "export.created",
            seed.a.user,
            "req-9",
        )
        assert event["metadata"] == {"rows": 26}

    def test_users_cannot_log_events_for_another_tenant(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with acting(conn, seed.a.user), pytest.raises(pg.Error), conn.transaction():
            conn.execute(
                "select audit.log_event(%s, 'export.created', 'run', 'x', '{}'::jsonb)",
                [seed.b.tenant],
            )

    @pytest.mark.parametrize("role", ["anon", "authenticated", "app_api", "app_worker"])
    @pytest.mark.parametrize("table", sorted(AUDIT_TABLES))
    def test_audit_tables_are_closed_to_application_roles(
        self, conn: DictConnection, role: str, table: str
    ) -> None:
        for privilege in ("select", "insert", "update", "delete", "truncate"):
            has = conn.execute(
                "select has_table_privilege(%s, %s, %s) as ok",
                [role, f"audit.{table}", privilege],
            ).fetchone()
            assert has == {"ok": False}, (role, table, privilege)


class TestRoles:
    def test_app_api_cannot_bypass_rls_and_has_a_statement_timeout(
        self, conn: DictConnection
    ) -> None:
        role = conn.execute(
            "select rolbypassrls, rolconfig from pg_roles where rolname = 'app_api'"
        ).fetchone()

        assert role is not None
        assert role["rolbypassrls"] is False
        assert "statement_timeout=5s" in role["rolconfig"]

    def test_app_api_can_act_as_authenticated_and_is_then_bound_by_rls(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        conn.execute("set local role app_api")
        conn.execute("set local role authenticated")
        conn.execute(
            "select set_config('request.jwt.claims', %s, true)",
            [f'{{"sub": "{seed.a.user}"}}'],
        )

        seen = conn.execute(
            "select count(*) as n from public.conversations where tenant_id = any(%s)",
            [[seed.a.tenant, seed.b.tenant]],  # API tests add tenants to the shared database
        ).fetchone()
        conn.execute("reset role")

        assert seen == {"n": 1}

    def test_app_worker_bypasses_rls_and_can_write_fact_tables(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        role = conn.execute(
            "select rolbypassrls from pg_roles where rolname = 'app_worker'"
        ).fetchone()
        assert role == {"rolbypassrls": True}

        conn.execute("set local role app_worker")
        seen = conn.execute(
            "select count(*) as n from public.conversations where tenant_id = any(%s)",
            [[seed.a.tenant, seed.b.tenant]],  # API tests add tenants to the shared database
        ).fetchone()
        conn.execute("update public.forecasts set p50 = 12 where tenant_id = %s", [seed.b.tenant])
        conn.execute("reset role")
        assert seen == {"n": 2}


class TestStorage:
    def test_users_reach_only_their_tenant_folder(self, conn: DictConnection, seed: Seed) -> None:
        with acting(conn, seed.a.user):
            names = [r["name"] for r in conn.execute("select name from storage.objects").fetchall()]
            with pytest.raises(DENIED), conn.transaction():
                conn.execute(
                    "insert into storage.objects (bucket_id, name) values ('uploads', %s)",
                    [f"{seed.b.tenant}/x/evil.xlsx"],
                )
            conn.execute(
                "insert into storage.objects (bucket_id, name) values ('uploads', %s)",
                [f"{seed.a.tenant}/x/ok.xlsx"],
            )

        assert names == [f"{seed.a.tenant}/{seed.a.upload}/kardex.xlsx"]

    def test_the_uploads_bucket_is_private(self, conn: DictConnection) -> None:
        bucket = conn.execute("select public from storage.buckets where id = 'uploads'").fetchone()

        assert bucket == {"public": False}

    def test_users_cannot_replace_or_delete_objects(self, conn: DictConnection, seed: Seed) -> None:
        with acting(conn, seed.a.user):
            updated = conn.execute("update storage.objects set name = name")
            deleted = conn.execute("delete from storage.objects")

        assert (updated.rowcount, deleted.rowcount) == (0, 0)


class TestSignupHook:
    def call(self, conn: DictConnection, email: str) -> dict:
        row = conn.execute(
            "select public.hook_restrict_signup(%s::jsonb) as r",
            [json.dumps({"user": {"email": email}})],
        ).fetchone()
        assert row is not None
        return row["r"]

    def test_invited_emails_are_allowed_case_insensitively(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        assert self.call(conn, seed.a.email.upper()) == {}

    def test_unknown_emails_are_rejected_with_a_neutral_error(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        result = self.call(conn, "intruder@example.com")

        assert result["error"]["http_code"] == 403
        assert "intruder" not in result["error"]["message"]

    def test_only_the_auth_service_can_call_the_hook(self, conn: DictConnection) -> None:
        for role, expected in (
            ("supabase_auth_admin", True),
            ("authenticated", False),
            ("anon", False),
        ):
            has = conn.execute(
                "select has_function_privilege(%s, 'public.hook_restrict_signup(jsonb)', "
                "'execute') as ok",
                [role],
            ).fetchone()
            assert has == {"ok": expected}, role


class TestServerOwnedCounters:
    """Migration 0004: a member holding a JWT cannot reset or inflate the rate-limit counters."""

    def test_a_member_cannot_reset_the_token_budget(self, conn: DictConnection, seed: Seed) -> None:
        with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
            conn.execute("update public.rate_limits set count = 0")

    def test_a_member_cannot_write_a_counter_row(self, conn: DictConnection, seed: Seed) -> None:
        with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
            conn.execute(
                "insert into public.rate_limits (tenant_id, scope, window_start, count) "
                "values (%s, 'tenant:tokens', now(), 999999)",
                [seed.a.tenant],
            )

    def test_the_hit_function_refuses_a_caller_that_is_not_the_api(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
            conn.execute("select public.rate_limit_hit('upload', 3600)")

    def test_the_spend_function_refuses_a_caller_that_is_not_the_api(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
            conn.execute("select public.spend_tokens(1000)")

    @pytest.mark.parametrize(("role", "expected"), [("anon", False), ("authenticated", True)])
    def test_who_may_execute_the_counter_functions(
        self, conn: DictConnection, role: str, expected: bool
    ) -> None:
        for signature in ("public.rate_limit_hit(text, integer)", "public.spend_tokens(integer)"):
            has = conn.execute(
                "select has_function_privilege(%s, %s, 'execute') as ok", [role, signature]
            ).fetchone()
            assert has == {"ok": expected}, (role, signature)


class TestServerSideGuards:
    def test_users_cannot_log_an_event_without_a_tenant(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with acting(conn, seed.a.user), pytest.raises(DENIED), conn.transaction():
            conn.execute("select audit.log_event(null, 'x.y', 'run', 'x', '{}'::jsonb)")

    def test_users_cannot_log_oversized_metadata(self, conn: DictConnection, seed: Seed) -> None:
        with acting(conn, seed.a.user), pytest.raises(pg.InvalidParameterValue), conn.transaction():
            conn.execute(
                "select audit.log_event(%s, 'x.y', 'run', 'x', "
                "jsonb_build_object('k', repeat('x', 20000)))",
                [seed.a.tenant],
            )

    def test_an_upload_path_must_start_with_its_own_tenant_and_id(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with pytest.raises(pg.CheckViolation), conn.transaction():
            conn.execute(
                "insert into public.uploads (tenant_id, conversation_id, created_by, storage_path, "
                "file_name, size_bytes, content_type, status) values (%s, %s, %s, %s, 'f.xlsx', 1, "
                "'text/csv', 'pending')",
                [seed.a.tenant, seed.a.conversation, seed.a.user, f"{seed.b.tenant}/x/f.xlsx"],
            )

    def test_an_idempotency_key_cannot_outlive_its_window(
        self, conn: DictConnection, seed: Seed
    ) -> None:
        with pytest.raises(pg.CheckViolation), conn.transaction():
            conn.execute(
                "insert into public.idempotency_keys (tenant_id, key, request_hash, expires_at) "
                "values (%s, 'key-too-long-1', 'h', now() + interval '30 days')",
                [seed.a.tenant],
            )

    def test_an_idempotency_response_is_size_capped(self, conn: DictConnection, seed: Seed) -> None:
        with pytest.raises(pg.CheckViolation), conn.transaction():
            conn.execute(
                "insert into public.idempotency_keys (tenant_id, key, request_hash, response, "
                "expires_at) values (%s, 'key-big-resp-1', 'h', "
                "jsonb_build_object('k', repeat('x', 40000)), now() + interval '1 hour')",
                [seed.a.tenant],
            )
