from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest

import pgtest

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"


@pytest.fixture(scope="module")
def dsn(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    if pgtest.find_bin_dir() is None:
        pytest.skip("PostgreSQL binaries not found")
    data = tmp_path_factory.mktemp("pgdata")
    url, stop = pgtest.start_cluster(data)
    pgtest.install_schema(url, MIGRATIONS)
    yield url
    stop()


def test_schema_has_the_shim_and_the_migrations(dsn: str) -> None:
    with psycopg.connect(dsn) as conn:
        tables = {
            r[0]
            for r in conn.execute("select tablename from pg_tables where schemaname = 'public'")
        }
        roles = {r[0] for r in conn.execute("select rolname from pg_roles")}

    assert {"tenants", "jobs", "conversations"} <= tables
    assert {"authenticated", "app_api", "app_worker"} <= roles


def test_sqlalchemy_url_keeps_host_port_and_database(dsn: str) -> None:
    url = pgtest.sqlalchemy_url(dsn, driver="asyncpg", user="app_api", password="pw")

    assert url.startswith("postgresql+asyncpg://app_api:pw@127.0.0.1:")
    assert url.endswith("/castly")


def test_missing_binaries_raise_a_clear_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(pgtest, "find_bin_dir", lambda: None)

    with pytest.raises(pgtest.PostgresUnavailableError):
        pgtest.start_cluster(tmp_path)
