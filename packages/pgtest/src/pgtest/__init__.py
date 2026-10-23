"""Ephemeral PostgreSQL for tests (no Docker). See README."""

from __future__ import annotations

import glob
import os
import shutil
import socket
import subprocess
from collections.abc import Callable
from pathlib import Path

import psycopg

SHIM = Path(__file__).with_name("supabase_shim.sql")
DB_NAME = "castly"


class PostgresUnavailableError(RuntimeError):
    """The PostgreSQL binaries (initdb, pg_ctl) are not on this machine."""


def find_bin_dir() -> Path | None:
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
        message = f"{command[0]} failed: {result.stderr or result.stdout}"
        raise RuntimeError(message)


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def start_cluster(data_dir: Path) -> tuple[str, Callable[[], None]]:
    """Start a cluster in `data_dir` (must be empty) and create the `castly` database.

    Returns a libpq DSN for that database and a function that stops the cluster.
    Raises `PostgresUnavailableError` when the binaries are missing.
    """
    bin_dir = find_bin_dir()
    if bin_dir is None:
        message = "PostgreSQL binaries (initdb, pg_ctl) not found"
        raise PostgresUnavailableError(message)
    port = _free_port()
    _run(
        [
            str(bin_dir / "initdb"), "-D", str(data_dir), "-U", "postgres", "-A", "trust",
            "--no-sync", "--locale=C", "-E", "UTF8",
        ]
    )  # fmt: skip
    options = f"-p {port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c fsync=off"
    log = (
        data_dir / "server.log"
    )  # without -l the server inherits our pipes and run() never returns
    _run(
        [str(bin_dir / "pg_ctl"), "-D", str(data_dir), "-l", str(log), "-o", options, "-w", "start"]
    )

    def stop() -> None:
        _run([str(bin_dir / "pg_ctl"), "-D", str(data_dir), "-m", "immediate", "stop"])

    base = f"host=127.0.0.1 port={port} user=postgres"
    try:
        with psycopg.connect(f"{base} dbname=postgres", autocommit=True) as admin:
            admin.execute(f"create database {DB_NAME}")
    except Exception:
        stop()
        raise
    return f"{base} dbname={DB_NAME}", stop


def install_schema(dsn: str, migrations: Path) -> None:
    """Supabase shim, then every migration in order."""
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(SHIM.read_text())  # ty: ignore[no-matching-overload]
        for migration in sorted(migrations.glob("*.sql")):
            conn.execute(migration.read_text())  # ty: ignore[no-matching-overload]


def sqlalchemy_url(dsn: str, *, driver: str, user: str | None = None, password: str = "") -> str:
    """A SQLAlchemy URL for the cluster behind a libpq DSN, optionally as another role."""
    parts = dict(item.split("=", 1) for item in dsn.split())
    login = user or parts["user"]
    credentials = f"{login}:{password}@" if password else f"{login}@"
    return f"postgresql+{driver}://{credentials}{parts['host']}:{parts['port']}/{parts['dbname']}"
