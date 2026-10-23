"""Ephemeral PostgreSQL for database tests: Supabase shim, then every migration, then a seed.

No Docker needed: the fixture runs `initdb` / `pg_ctl` from the PostgreSQL binaries on the machine
(Homebrew, apt or the CI runner). Set REQUIRE_DB_TESTS=1 (CI does) to fail instead of skip when
they are missing.
"""

from __future__ import annotations

import glob
import json
import os
import re
import shutil
import socket
import subprocess
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, LiteralString, cast
from uuid import UUID

import psycopg
import pytest
from psycopg.rows import dict_row

from .seed import Seed, seed_two_tenants

REPO = Path(__file__).resolve().parents[4]
MIGRATIONS = REPO / "supabase" / "migrations"
SHIM = Path(__file__).with_name("supabase_shim.sql")
DB_NAME = "castly"

DictConnection = psycopg.Connection[dict[str, Any]]


_NAME = re.compile(r"^[a-z_]+(\.[a-z_]+)?$")


def q(template: str, **names: str) -> LiteralString:
    """Fill identifiers (tables, columns, roles) into SQL. Names must be plain identifiers, so the
    result is safe to treat as a literal for psycopg's typing."""
    for value in names.values():
        if not _NAME.match(value):
            message = f"not a plain identifier: {value!r}"
            raise ValueError(message)
    sql = template.format(
        **{k: v.replace("_", " ") if k == "overriding" else v for k, v in names.items()}
    )
    return cast("LiteralString", sql)


def _bin_dir() -> Path | None:
    found = shutil.which("pg_ctl")
    if found:
        return Path(found).parent
    candidates = sorted(glob.glob("/usr/lib/postgresql/*/bin"))
    return Path(candidates[-1]) if candidates else None


def _run(command: list[str]) -> None:
    """Run a PostgreSQL tool with a fixed locale (the host's LANG/LC_* may be invalid)."""
    env = {**os.environ, "LC_ALL": "C", "LANG": "C"}
    result = subprocess.run(command, capture_output=True, text=True, env=env, check=False)  # noqa: S603
    if result.returncode:
        pytest.fail(f"{command[0]} failed: {result.stderr or result.stdout}")


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture(scope="session")
def pg_dsn(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    bin_dir = _bin_dir()
    if bin_dir is None:
        message = "PostgreSQL binaries (initdb, pg_ctl) not found"
        if os.environ.get("REQUIRE_DB_TESTS"):
            pytest.fail(message)
        pytest.skip(message)
    data = tmp_path_factory.mktemp("pgdata")
    port = _free_port()
    _run(
        [
            str(bin_dir / "initdb"), "-D", str(data), "-U", "postgres", "-A", "trust",
            "--no-sync", "--locale=C", "-E", "UTF8",
        ]
    )  # fmt: skip
    options = f"-p {port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c fsync=off"
    log = data / "server.log"  # without -l the server inherits our pipes and run() never returns
    _run([str(bin_dir / "pg_ctl"), "-D", str(data), "-l", str(log), "-o", options, "-w", "start"])
    base = f"host=127.0.0.1 port={port} user=postgres"
    try:
        with psycopg.connect(f"{base} dbname=postgres", autocommit=True) as admin:
            admin.execute(q("create database {name}", name=DB_NAME))
        yield f"{base} dbname={DB_NAME}"
    finally:
        _run([str(bin_dir / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"])


@pytest.fixture(scope="session")
def seed(pg_dsn: str) -> Seed:
    """Shim + all migrations + two tenants of data, committed once for the whole session."""
    with psycopg.connect(pg_dsn, autocommit=True) as conn:
        conn.execute(cast("LiteralString", SHIM.read_text()))
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            conn.execute(cast("LiteralString", migration.read_text()))
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
    parts = dict(item.split("=", 1) for item in pg_dsn.split())
    return f"postgresql+asyncpg://app_api:test@{parts['host']}:{parts['port']}/{parts['dbname']}"
