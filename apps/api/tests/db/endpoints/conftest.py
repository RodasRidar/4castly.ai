"""API tests over HTTP against the ephemeral PostgreSQL: real JWT verification, real RLS.

Each test gets its own tenant, so writes made through the API never collide.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from api.adapters.jwks import JwksTokenVerifier
from api.main import create_app
from api.settings import Settings
from authn.keys import AUDIENCE, ISSUER, TestKey, jwks
from db.seed import Side, seed_side

PROBLEM = "application/problem+json"


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
    with app_client(api_url, signing_key) as client:
        yield World(side, client, signing_key, pg_dsn)
