"""Ephemeral PostgreSQL for database tests: Supabase shim, then every migration, then a seed.

No Docker needed: the fixture runs `initdb` / `pg_ctl` from the PostgreSQL binaries on the machine
(Homebrew, apt or the CI runner). Set REQUIRE_DB_TESTS=1 (CI does) to fail instead of skip when
they are missing.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, LiteralString, cast
from uuid import UUID

import pgtest
import psycopg
import pytest
from psycopg.rows import dict_row

from .seed import Seed, seed_two_tenants

REPO = Path(__file__).resolve().parents[4]
MIGRATIONS = REPO / "supabase" / "migrations"

DictConnection = psycopg.Connection[dict[str, Any]]


_NAME = re.compile(r"^[a-z_]+(\.[a-z_]+)?$")


def q(template: str, **names: str) -> LiteralString:
    """Fill identifiers (tables, columns, roles) into SQL. Names must be plain identifiers, so the
    result is safe to treat as a literal for psycopg's typing."""
    for value in names.values():
        if not _NAME.match(value):
            message = f"not a plain identifier: {value!r}"
            raise ValueError(message)
    return cast("LiteralString", template.format(**names))


@pytest.fixture(scope="session")
def pg_dsn(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    try:
        dsn, stop = pgtest.start_cluster(tmp_path_factory.mktemp("pgdata"))
    except pgtest.PostgresUnavailableError as error:
        if os.environ.get("REQUIRE_DB_TESTS"):
            pytest.fail(str(error))
        pytest.skip(str(error))
    try:
        yield dsn
    finally:
        stop()


@pytest.fixture(scope="session")
def seed(pg_dsn: str) -> Seed:
    """Shim + all migrations + two tenants of data, committed once for the whole session."""
    pgtest.install_schema(pg_dsn, MIGRATIONS)
    with psycopg.connect(pg_dsn, autocommit=True) as conn:
        return seed_two_tenants(conn)


@pytest.fixture
def conn(pg_dsn: str, seed: Seed) -> Iterator[DictConnection]:
    """A superuser connection in a transaction that is always rolled back."""
    assert seed
    with DictConnection.connect(pg_dsn, row_factory=dict_row) as connection:
        yield connection
        connection.rollback()


@contextmanager
def acting(
    conn: DictConnection,
    user_id: UUID | None,
    *,
    role: str = "authenticated",
    request_id: str | None = None,
) -> Generator[DictConnection]:
    """Run statements as a Supabase user: `set local role` plus JWT claims, like the API does."""
    claims = json.dumps({"sub": str(user_id), "role": role}) if user_id else ""
    conn.execute(q("set local role {role}", role=role))
    conn.execute("select set_config('request.jwt.claims', %s, true)", [claims])
    if request_id:
        conn.execute("select set_config('app.request_id', %s, true)", [request_id])
    try:
        yield conn
    finally:
        conn.execute("reset role")


@pytest.fixture(scope="session")
def api_url(pg_dsn: str, seed: Seed) -> str:
    """SQLAlchemy URL that connects as the real `app_api` role (no BYPASSRLS), like production."""
    assert seed
    with psycopg.connect(pg_dsn, autocommit=True) as admin:
        admin.execute("alter role app_api login password 'test'")
    return pgtest.sqlalchemy_url(pg_dsn, driver="asyncpg", user="app_api", password="test")
