"""Daily purge of expired idempotency keys (D11): live keys and other tenants' rows stay."""

from __future__ import annotations

from sqlalchemy import Engine

from worker.adapters.db.housekeeping import SqlHousekeeping

from .conftest import DictConnection, Tenant


def add_key(admin: DictConnection, tenant: Tenant, key: str, *, expires: str) -> None:
    admin.execute(
        "insert into public.idempotency_keys (tenant_id, key, request_hash, response, expires_at) "
        "values (%s, %s, 'h', '{}'::jsonb, now() + %s::interval)",
        [tenant.id, key, expires],
    )


def keys(admin: DictConnection, tenant: Tenant) -> set[str]:
    rows = admin.execute(
        "select key from public.idempotency_keys where tenant_id = %s", [tenant.id]
    ).fetchall()
    return {row["key"] for row in rows}


def test_only_expired_keys_are_deleted(
    engine: Engine, admin: DictConnection, tenant: Tenant
) -> None:
    add_key(admin, tenant, "expired-one", expires="-1 hour")
    add_key(admin, tenant, "expired-two", expires="-2 days")
    add_key(admin, tenant, "still-valid", expires="1 hour")

    deleted = SqlHousekeeping(engine).purge_expired_idempotency_keys()

    assert deleted == 2
    assert keys(admin, tenant) == {"still-valid"}


def test_purging_with_nothing_expired_deletes_nothing(
    engine: Engine, admin: DictConnection, tenant: Tenant
) -> None:
    add_key(admin, tenant, "fresh-key-1", expires="3 hours")

    assert SqlHousekeeping(engine).purge_expired_idempotency_keys() == 0
    assert keys(admin, tenant) == {"fresh-key-1"}
