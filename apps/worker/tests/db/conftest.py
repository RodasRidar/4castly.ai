"""Ephemeral PostgreSQL with the real migrations; the worker connects as `app_worker`."""

from __future__ import annotations

import os
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pgtest
import psycopg
import psycopg.rows
import pytest
from sqlalchemy import Engine, create_engine

MIGRATIONS = Path(__file__).resolve().parents[4] / "supabase" / "migrations"

DictConnection = psycopg.Connection[dict[str, Any]]


@dataclass(frozen=True)
class Tenant:
    id: UUID
    user_id: UUID
    conversation_id: UUID
    upload_id: UUID
    job_id: UUID


@pytest.fixture(scope="session")
def pg_dsn(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    try:
        dsn, stop = pgtest.start_cluster(tmp_path_factory.mktemp("pgdata"))
    except pgtest.PostgresUnavailableError as error:
        if os.environ.get("REQUIRE_DB_TESTS"):
            pytest.fail(str(error))
        pytest.skip(str(error))
    try:
        pgtest.install_schema(dsn, MIGRATIONS)
        with psycopg.connect(dsn, autocommit=True) as admin:
            admin.execute("alter role app_worker login password 'test'")
        yield dsn
    finally:
        stop()


@pytest.fixture(scope="session")
def worker_url(pg_dsn: str) -> str:
    return pgtest.sqlalchemy_url(pg_dsn, driver="psycopg", user="app_worker", password="test")


@pytest.fixture
def engine(worker_url: str) -> Iterator[Engine]:
    created = create_engine(worker_url)
    yield created
    created.dispose()


@pytest.fixture
def admin(pg_dsn: str) -> Iterator[DictConnection]:
    """Superuser autocommit connection, for arranging and checking state."""
    with DictConnection.connect(pg_dsn, autocommit=True, row_factory=psycopg.rows.dict_row) as conn:
        yield conn


@pytest.fixture
def tenant(admin: DictConnection) -> Iterator[Tenant]:
    """A tenant with a user, a conversation (stage digesting), an upload and a queued digest job."""
    tenant_id, user_id, conversation_id, upload_id, job_id = (uuid4() for _ in range(5))
    admin.execute("insert into public.tenants (id, name) values (%s, 'T')", [tenant_id])
    admin.execute(
        "insert into auth.users (id, email) values (%s, %s)", [user_id, f"{user_id}@t.test"]
    )
    admin.execute(
        "insert into public.conversations (id, tenant_id, created_by, title, stage) "
        "values (%s, %s, %s, 'Kardex', 'digesting')",
        [conversation_id, tenant_id, user_id],
    )
    admin.execute(
        "insert into public.uploads (id, tenant_id, conversation_id, created_by, storage_path, "
        "file_name, size_bytes, content_type, status) values "
        "(%s, %s, %s, %s, %s, 'kardex.xlsx', 100, 'application/vnd.ms-excel', 'uploaded')",
        [upload_id, tenant_id, conversation_id, user_id, f"{tenant_id}/{upload_id}/kardex.xlsx"],
    )
    admin.execute(
        "insert into public.jobs (id, tenant_id, conversation_id, kind, status, params) "
        "values (%s, %s, %s, 'digest', 'queued', '{\"lead_time_days\": 30}')",
        [job_id, tenant_id, conversation_id],
    )
    yield Tenant(tenant_id, user_id, conversation_id, upload_id, job_id)
    # Cascades to conversations, uploads, jobs, runs...: tests share one database.
    admin.execute("delete from public.tenants where id = %s", [tenant_id])
    admin.execute("delete from auth.users where id = %s", [user_id])
