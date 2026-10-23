"""API tests over HTTP against the ephemeral PostgreSQL: real JWT verification, real RLS.

Each test gets its own tenant, so writes made through the API never collide.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from api.adapters.jwks import JwksTokenVerifier
from api.main import create_app
from api.ports.storage import SignedDownload, SignedUpload, StoredObject
from api.settings import Settings
from authn.keys import AUDIENCE, ISSUER, TestKey, jwks
from db.seed import Side, seed_side

PROBLEM = "application/problem+json"


class FakeStorage:
    """In-memory bucket: tests put objects in `objects` as the browser would."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.upload_requests: list[tuple[str, str]] = []

    async def create_upload_url(self, path: str, content_type: str) -> SignedUpload:
        self.upload_requests.append((path, content_type))
        return SignedUpload(
            url=f"https://storage.test/upload/{path}?token=t",
            headers={"Content-Type": content_type},
            expires_at=datetime.now(UTC) + timedelta(hours=2),
        )

    async def stat(self, path: str) -> StoredObject | None:
        data = self.objects.get(path)
        return None if data is None else StoredObject(len(data), data[:8192])

    async def create_download_url(self, path: str, *, ttl_seconds: int = 60) -> SignedDownload:
        return SignedDownload(
            f"https://storage.test/download/{path}?ttl={ttl_seconds}",
            datetime.now(UTC) + timedelta(seconds=ttl_seconds),
        )

    async def put(self, path: str, data: bytes, content_type: str) -> None:
        self.objects[path] = data


class FakeSpawner:
    def __init__(self) -> None:
        self.spawned: list[tuple[str, UUID]] = []
        self.fail = False

    async def spawn(self, kind: str, job_id: UUID) -> None:
        if self.fail:
            raise RuntimeError("modal is down")
        self.spawned.append((kind, job_id))


@pytest.fixture(scope="session")
def signing_key() -> TestKey:
    return TestKey("test-key-1")


@dataclass(frozen=True)
class World:
    """One freshly seeded tenant and its owner, plus a client that can act as any user."""

    side: Side
    client: TestClient
    key: TestKey
    dsn: str
    storage: FakeStorage
    spawner: FakeSpawner

    def headers(self, user: UUID | None = None, **claims: Any) -> dict[str, str]:
        token = self.key.token(
            {
                "sub": str(user or self.side.user),
                "email": claims.pop("email", self.side.email),
                **claims,
            }
        )
        return {"Authorization": f"Bearer {token}"}


def new_side(pg_dsn: str, name: str = "T") -> Side:
    with psycopg.connect(pg_dsn, autocommit=True) as admin:
        return seed_side(admin, f"{name}-{uuid4().hex[:6]}", f"{uuid4().hex[:8]}@example.com")


def app_client(api_url: str, key: TestKey, **overrides: Any) -> TestClient:
    async def fetch(_url: str) -> dict[str, Any]:
        return jwks(key)

    verifier = JwksTokenVerifier(
        jwks_url="http://jwks.test/keys", issuer=ISSUER, audience=AUDIENCE, fetch=fetch
    )
    settings = Settings(database_url=api_url, supabase_url="http://127.0.0.1:54321")
    return TestClient(create_app(settings, verifier=verifier, **overrides))


@pytest.fixture
def world(pg_dsn: str, api_url: str, signing_key: TestKey) -> Iterator[World]:
    side = new_side(pg_dsn)
    storage, spawner = FakeStorage(), FakeSpawner()
    with app_client(api_url, signing_key, storage=storage, spawner=spawner) as client:
        yield World(side, client, signing_key, pg_dsn, storage, spawner)


def fetch_row(admin: psycopg.Connection, sql: str, params: list) -> tuple:
    row = admin.execute(sql, params).fetchone()  # ty: ignore[invalid-argument-type]
    assert row is not None
    return row


def add_conversation(world: World, *, stage: str = "digesting", title: str = "Kardex") -> UUID:
    conversation = uuid4()
    with psycopg.connect(world.dsn, autocommit=True) as admin:
        admin.execute(
            "insert into public.conversations (id, tenant_id, created_by, title, stage) "
            "values (%s, %s, %s, %s, %s)",
            [conversation, world.side.tenant, world.side.user, title, stage],
        )
    return conversation


def add_job(  # noqa: PLR0913
    world: World,
    conversation: UUID,
    *,
    kind: str = "digest",
    status: str = "queued",
    stage: str | None = None,
    processed: int | None = None,
    total: int | None = None,
    error_ref: str | None = None,
) -> UUID:
    job = uuid4()
    with psycopg.connect(world.dsn, autocommit=True) as admin:
        admin.execute(
            "insert into public.jobs (id, tenant_id, conversation_id, kind, status, stage, "
            "processed, total, error_ref, finished_at) values (%s, %s, %s, %s, %s, %s, %s, %s, "
            "%s, case when %s in ('succeeded', 'failed', 'cancelled') then now() end)",
            [
                job,
                world.side.tenant,
                conversation,
                kind,
                status,
                stage,
                processed,
                total,
                error_ref,
                status,
            ],
        )
    return job
