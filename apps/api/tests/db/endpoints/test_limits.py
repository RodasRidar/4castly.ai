"""S20 rate limits (fixed windows in Postgres) and R7 idempotency keys (24 h)."""

from __future__ import annotations

import time
from uuid import uuid4

import psycopg
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from api.auth import Principal
from api.db.context import RequestContext, tenant_session
from api.db.engine import create_engine
from api.domain.errors import ConflictError, TooManyRequestsError
from api.services import idempotency, limits

from .conftest import new_side


@pytest.fixture
async def engine(api_url: str):
    engine = create_engine(api_url)
    yield engine
    await engine.dispose()


def principal(side) -> Principal:
    ctx = RequestContext(user_id=side.user, claims={"role": "authenticated"}, request_id="r1")
    return Principal(ctx, side.tenant, "owner", side.email)


async def hit(engine: AsyncEngine, who: Principal, action: str, *, limit: int, window: int) -> None:
    async with tenant_session(engine, who.ctx) as session:
        await limits.enforce(session, who, action, limit=limit, window_seconds=window)


class TestRateLimits:
    async def test_requests_over_the_limit_are_refused(self, engine, pg_dsn: str) -> None:
        who = principal(new_side(pg_dsn))

        for _ in range(3):
            await hit(engine, who, "upload", limit=3, window=3600)

        with pytest.raises(TooManyRequestsError):
            await hit(engine, who, "upload", limit=3, window=3600)

    async def test_actions_and_users_have_separate_counters(self, engine, pg_dsn: str) -> None:
        side = new_side(pg_dsn)
        who = principal(side)
        await hit(engine, who, "upload", limit=1, window=3600)

        await hit(engine, who, "export", limit=1, window=3600)  # other action

        with psycopg.connect(pg_dsn, autocommit=True) as admin:
            other_user = uuid4()
            admin.execute("insert into auth.users (id, email) values (%s, 'x@y.z')", [other_user])
            admin.execute(
                "insert into public.tenant_members (tenant_id, user_id) values (%s, %s)",
                [side.tenant, other_user],
            )
        ctx = RequestContext(user_id=other_user, claims={"role": "authenticated"})
        async with tenant_session(engine, ctx) as session:
            await limits.enforce(
                session,
                Principal(ctx, side.tenant, "member", None),
                "upload",
                limit=1,
                window_seconds=3600,
            )

    async def test_a_new_window_starts_a_new_count(self, engine, pg_dsn: str) -> None:
        who = principal(new_side(pg_dsn))
        await hit(engine, who, "upload", limit=1, window=1)

        time.sleep(1.1)

        await hit(engine, who, "upload", limit=1, window=1)

    async def test_another_tenants_counters_are_invisible(self, engine, pg_dsn: str) -> None:
        first, second = principal(new_side(pg_dsn)), principal(new_side(pg_dsn))
        await hit(engine, first, "upload", limit=1, window=3600)

        await hit(engine, second, "upload", limit=1, window=3600)


class TestIdempotency:
    async def test_the_first_use_of_a_key_has_nothing_to_replay(self, engine, pg_dsn: str) -> None:
        who = principal(new_side(pg_dsn))

        async with tenant_session(engine, who.ctx) as session:
            assert await idempotency.replay(session, who, "key-0001-a", "hash-1") is None

    async def test_the_same_key_and_request_replays_the_stored_response(
        self,
        engine,
        pg_dsn: str,
    ) -> None:
        who = principal(new_side(pg_dsn))
        async with tenant_session(engine, who.ctx) as session:
            await idempotency.save(session, who, "key-0001-a", "hash-1", {"job_id": "j1"})

        async with tenant_session(engine, who.ctx) as session:
            replayed = await idempotency.replay(session, who, "key-0001-a", "hash-1")

        assert replayed == {"job_id": "j1"}

    async def test_the_same_key_for_a_different_request_is_a_conflict(
        self,
        engine,
        pg_dsn: str,
    ) -> None:
        who = principal(new_side(pg_dsn))
        async with tenant_session(engine, who.ctx) as session:
            await idempotency.save(session, who, "key-0001-a", "hash-1", {"job_id": "j1"})

        async with tenant_session(engine, who.ctx) as session:
            with pytest.raises(ConflictError):
                await idempotency.replay(session, who, "key-0001-a", "other-hash")

    async def test_expired_keys_are_ignored(self, engine, pg_dsn: str) -> None:
        side = new_side(pg_dsn)
        who = principal(side)
        with psycopg.connect(pg_dsn, autocommit=True) as admin:
            admin.execute(
                "insert into public.idempotency_keys (tenant_id, key, request_hash, response, "
                "expires_at) values (%s, 'key-0001-old', 'h', '{}', now() - interval '1 s')",
                [side.tenant],
            )

        async with tenant_session(engine, who.ctx) as session:
            assert await idempotency.replay(session, who, "key-0001-old", "h") is None

    async def test_keys_are_scoped_to_the_tenant(self, engine, pg_dsn: str) -> None:
        first, second = principal(new_side(pg_dsn)), principal(new_side(pg_dsn))
        async with tenant_session(engine, first.ctx) as session:
            await idempotency.save(session, first, "key-0001-a", "h", {"x": 1})

        async with tenant_session(engine, second.ctx) as session:
            assert await idempotency.replay(session, second, "key-0001-a", "h") is None

    def test_the_request_hash_covers_operation_ids_and_body(self) -> None:
        base = idempotency.request_hash("complete_upload", "u1", {"a": 1})

        assert base == idempotency.request_hash("complete_upload", "u1", {"a": 1})
        assert base != idempotency.request_hash("start_forecast", "u1", {"a": 1})
        assert base != idempotency.request_hash("complete_upload", "u2", {"a": 1})
        assert base != idempotency.request_hash("complete_upload", "u1", {"a": 2})
