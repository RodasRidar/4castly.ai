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
from psycopg.types.json import Jsonb

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


def add_message(  # noqa: PLR0913
    world: World,
    conversation: UUID,
    *,
    role: str = "user",
    kind: str = "text",
    text: str = "hola",
    payload: dict | None = None,
    product: UUID | None = None,
) -> UUID:
    message = uuid4()
    with psycopg.connect(world.dsn, autocommit=True) as admin:
        admin.execute(
            "insert into public.messages (id, tenant_id, conversation_id, role, kind, "
            "display_text, payload, context_product_id) values (%s, %s, %s, %s, %s, %s, %s, %s)",
            [
                message,
                world.side.tenant,
                conversation,
                role,
                kind,
                text,
                Jsonb(payload or {}),
                product,
            ],
        )
    return message


TABULAR_PROFILE: dict[str, Any] = {
    "source_kind": "tabular",
    "sheets": [
        {
            "name": "Ventas",
            "row_count": 100,
            "columns": [
                {"name": "Fecha Doc", "inferred_type": "date", "samples": ["12/01/2026"]},
                {"name": "Cod Art", "inferred_type": "text", "samples": ["QF-0001", "QF-0002"]},
                {"name": "Artículo", "inferred_type": "text", "samples": ["Ácido cítrico"]},
                {"name": "Cant", "inferred_type": "number", "samples": ["1.850,5", "320"]},
                {"name": "Stock", "inferred_type": "number", "samples": ["10"]},
            ],
        },
        {"name": "Resumen", "row_count": 3, "columns": []},
    ],
    "date_from": "2026-01-12",
    "date_to": "2026-10-12",
}
TABULAR_PLAN = {
    "version": 1,
    "sheet": "Ventas",
    "header_row": 1,
    "date": {"column": "Fecha Doc", "format": "dd/mm/yyyy"},
    "product_code": {"column": "Cod Art"},
    "product_name": {"column": "Artículo"},
    "quantity": {"column": "Cant", "decimal_separator": ","},
    "stock": None,
    "unit": {"column": None, "default": "u"},
}
SUMMARY = {
    "products_found": 142,
    "date_from": "2026-01-12",
    "date_to": "2026-10-12",
    "history_weeks": 39,
    "rows_read": 5000,
    "rows_dropped": 12,
}


def tabular_document(**overrides: object) -> dict:
    document = {
        "version": 1,
        "source_kind": "tabular",
        "plan": TABULAR_PLAN,
        "summary": SUMMARY,
        "movement_rules": [],
        "warnings": [{"code": "dropped_rows", "severity": "info", "count": 12, "params": {}}],
        "date_column_candidates": [],
        "unmapped_required": [],
        "needs_date_column": False,
    }
    return {**document, **overrides}


def add_plan(  # noqa: PLR0913
    world: World,
    *,
    stage: str = "awaiting_confirmation",
    document: dict | None = None,
    profile: dict | None = None,
    sheets: list[str] | None = None,
    selected_sheet: str | None = "Ventas",
    proposed_by: str = "llm",
    confirmed: bool = False,
) -> UUID:
    """A conversation with an uploaded, digested file and its proposed (or confirmed) plan."""
    conversation = add_conversation(world, stage=stage)
    upload = uuid4()
    with psycopg.connect(world.dsn, autocommit=True) as admin:
        admin.execute(
            "insert into public.uploads (id, tenant_id, conversation_id, created_by, storage_path, "
            "file_name, size_bytes, content_type, status, sheets, selected_sheet, profile) "
            "values (%s, %s, %s, %s, %s, 'ventas.xlsx', 100, 'text/csv', 'readable', %s, %s, %s)",
            [
                upload,
                world.side.tenant,
                conversation,
                world.side.user,
                f"{world.side.tenant}/{upload}/ventas.xlsx",
                sheets or ["Ventas", "Resumen"],
                selected_sheet,
                Jsonb(profile or TABULAR_PROFILE),
            ],
        )
        admin.execute(
            "insert into public.normalization_plans (tenant_id, upload_id, plan, proposed_by, "
            "confirmed_at, confirmed_by) values (%s, %s, %s, %s, %s, %s)",
            [
                world.side.tenant,
                upload,
                Jsonb(document or tabular_document()),
                proposed_by,
                datetime.now(UTC) if confirmed else None,
                world.side.user if confirmed else None,
            ],
        )
    return conversation
