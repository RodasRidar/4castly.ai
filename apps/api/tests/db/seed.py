"""Two tenants with one row in every table, so isolation tests have something to hide."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

import psycopg


@dataclass(frozen=True)
class Side:
    """Everything seeded for one tenant."""

    tenant: UUID
    user: UUID
    product: UUID
    conversation: UUID
    upload: UUID
    job: UUID
    run: UUID
    message: UUID
    email: str


@dataclass(frozen=True)
class Seed:
    a: Side
    b: Side
    a2_user: UUID
    """A second member of tenant A (profiles are owner-only, not tenant-wide)."""


def seed_side(conn: psycopg.Connection, name: str, email: str) -> Side:
    tenant, user, product = uuid4(), uuid4(), uuid4()
    conversation, upload, job, run, message = uuid4(), uuid4(), uuid4(), uuid4(), uuid4()
    conn.execute("insert into public.tenants (id, name) values (%s, %s)", [tenant, name])
    conn.execute("insert into auth.users (id, email) values (%s, %s)", [user, email])
    conn.execute(
        "insert into public.tenant_members (tenant_id, user_id, role) values (%s, %s, 'owner')",
        [tenant, user],
    )
    conn.execute(
        "insert into public.allowed_emails (tenant_id, email) values (%s, %s)", [tenant, email]
    )
    conn.execute(
        "insert into public.profiles (user_id, full_name) values (%s, %s)", [user, f"User {name}"]
    )
    conn.execute(
        "insert into public.products (id, tenant_id, code, name, uom) values (%s, %s, 'QF-0001', "
        "'Ácido cítrico', 'kg')",
        [product, tenant],
    )
    conn.execute(
        "insert into public.conversations (id, tenant_id, created_by, title, stage) "
        "values (%s, %s, %s, %s, 'ready')",
        [conversation, tenant, user, f"Kardex {name}"],
    )
    conn.execute(
        "insert into public.uploads (id, tenant_id, conversation_id, created_by, storage_path, "
        "file_name, size_bytes, content_type, status) values "
        "(%s, %s, %s, %s, %s, 'kardex.xlsx', 100, 'application/vnd.ms-excel', 'readable')",
        [upload, tenant, conversation, user, f"{tenant}/{upload}/kardex.xlsx"],
    )
    conn.execute(
        "insert into public.normalization_plans (tenant_id, upload_id, plan, proposed_by) "
        "values (%s, %s, '{\"version\": 1}', 'llm')",
        [tenant, upload],
    )
    conn.execute(
        "insert into public.jobs (id, tenant_id, conversation_id, kind, status) "
        "values (%s, %s, %s, 'forecast', 'succeeded')",
        [job, tenant, conversation],
    )
    conn.execute(
        "insert into public.job_events (tenant_id, job_id, stage) values (%s, %s, 'reading_file')",
        [tenant, job],
    )
    conn.execute(
        "insert into public.sales (tenant_id, upload_id, product_id, sold_on, qty) "
        "values (%s, %s, %s, '2026-10-12', 10)",
        [tenant, upload, product],
    )
    conn.execute(
        "insert into public.movements (tenant_id, product_id, occurred_at, qty_out) "
        "values (%s, %s, '2026-10-12', 10)",
        [tenant, product],
    )
    conn.execute(
        "insert into public.demand_series (tenant_id, product_id, freq, period, demand) "
        "values (%s, %s, 'weekly', '2026-10-12', 10)",
        [tenant, product],
    )
    conn.execute(
        "insert into public.forecast_runs (id, tenant_id, conversation_id, job_id, status, "
        "data_until, horizon_weeks, granularity, params) "
        "values (%s, %s, %s, %s, 'ready', '2026-10-18', 12, 'weekly', '{}')",
        [run, tenant, conversation, job],
    )
    conn.execute(
        "update public.conversations set current_run_id = %s where id = %s", [run, conversation]
    )
    conn.execute(
        "insert into public.forecasts (tenant_id, product_id, run_id, job_id, horizon, p10, p50, "
        "p90, model) values (%s, %s, %s, %s, '2026-10-19', 5, 10, 15, 'autoets')",
        [tenant, product, run, job],
    )
    conn.execute(
        "insert into public.run_product_metrics (tenant_id, run_id, product_id, abc_class, "
        "typical_demand_low, typical_demand_expected, typical_demand_high, current_stock, risk, "
        "reliability, suggested_qty_low, suggested_qty_high, buy_before_action, lead_time_days, "
        "target_coverage_weeks) values (%s, %s, %s, 'A', 5, 10, 15, 100, 'optimal', 'high', 0, 0, "
        "'no_stockout', 14, 4)",
        [tenant, run, product],
    )
    conn.execute(
        "insert into public.product_overrides (tenant_id, product_id, lead_time_days) "
        "values (%s, %s, 21)",
        [tenant, product],
    )
    conn.execute(
        "insert into public.messages (id, tenant_id, conversation_id, role, kind, display_text, "
        "status) values (%s, %s, %s, 'user', 'text', 'hola', 'complete')",
        [message, tenant, conversation],
    )
    conn.execute(
        "insert into public.message_feedback (tenant_id, message_id, user_id, value) "
        "values (%s, %s, %s, 'up')",
        [tenant, message, user],
    )
    conn.execute(
        "insert into public.idempotency_keys (tenant_id, key, request_hash, response, expires_at) "
        "values (%s, %s, 'h', '{}', now() + interval '1 day')",
        [tenant, f"key-{name}-0001"],
    )
    conn.execute(
        "insert into public.rate_limits (tenant_id, scope, window_start, count) "
        "values (%s, 'upload', date_trunc('hour', now()), 1)",
        [tenant],
    )
    conn.execute(
        "insert into storage.objects (bucket_id, name) values ('uploads', %s)",
        [f"{tenant}/{upload}/kardex.xlsx"],
    )
    return Side(tenant, user, product, conversation, upload, job, run, message, email)


def seed_two_tenants(conn: psycopg.Connection) -> Seed:
    side_a = seed_side(conn, "A", "ana@example.com")
    side_b = seed_side(conn, "B", "beto@example.com")
    second = uuid4()
    conn.execute("insert into auth.users (id, email) values (%s, 'ana2@example.com')", [second])
    conn.execute(
        "insert into public.tenant_members (tenant_id, user_id) values (%s, %s)",
        [side_a.tenant, second],
    )
    conn.execute(
        "insert into public.profiles (user_id, full_name) values (%s, 'Ana Dos')", [second]
    )
    return Seed(a=side_a, b=side_b, a2_user=second)
