"""SQLAlchemy layer: engine options, per-request tenant transaction, SQLSTATE mapping, models."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import psycopg
import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from api.db.context import RequestContext, run_in_tenant, tenant_session
from api.db.engine import create_engine, engine_options
from api.db.errors import map_db_error
from api.db.models import Base
from api.domain.errors import (
    BusinessRuleError,
    ConflictError,
    GatewayTimeoutError,
    NotFoundError,
    UnavailableError,
)

from .seed import Seed


@pytest_asyncio.fixture
async def engine(api_url: str) -> AsyncIterator[AsyncEngine]:
    created = create_engine(api_url)
    yield created
    await created.dispose()


def ctx(user: uuid.UUID, request_id: str | None = "req-1") -> RequestContext:
    return RequestContext(
        user_id=user, claims={"sub": str(user), "role": "authenticated"}, request_id=request_id
    )


INSERT_OVERRIDE = text(
    "insert into public.product_overrides (tenant_id, product_id) values (:t, :p)"
)


class FakeOrig(Exception):  # noqa: N818 - stands in for asyncpg's exception
    def __init__(self, pgcode: str, hint: str | None = None) -> None:
        super().__init__(pgcode)
        self.pgcode = pgcode
        cause = Exception("cause")
        cause.hint = hint  # ty: ignore[unresolved-attribute]
        self.__cause__ = cause


def db_error(pgcode: str, hint: str | None = None) -> DBAPIError:
    return DBAPIError("select 1", None, FakeOrig(pgcode, hint))


class TestEngineOptions:
    def test_disables_the_prepared_statement_cache_for_the_pooler(self) -> None:
        options = engine_options("postgresql+asyncpg://u:p@h:6543/db")

        assert options["connect_args"]["statement_cache_size"] == 0
        assert options["pool_pre_ping"] is True

    def test_accepts_plain_postgres_urls_and_forces_the_asyncpg_driver(self) -> None:
        engine = create_engine("postgresql://u:p@h:6543/db")

        assert engine.url.drivername == "postgresql+asyncpg"

    def test_rejects_other_databases(self) -> None:
        with pytest.raises(ValueError, match="PostgreSQL"):
            create_engine("sqlite:///x.db")


class TestTenantSession:
    async def test_runs_as_authenticated_with_the_users_claims_and_request_id(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        async with tenant_session(engine, ctx(seed.a.user, "req-77")) as session:
            row = (
                await session.execute(
                    text(
                        "select current_user as role, auth.uid() as uid, "
                        "current_setting('app.request_id') as rid"
                    )
                )
            ).one()

        assert (row.role, row.uid, row.rid) == ("authenticated", seed.a.user, "req-77")

    async def test_rls_applies_to_the_api_connection(self, engine: AsyncEngine, seed: Seed) -> None:
        async with tenant_session(engine, ctx(seed.b.user)) as session:
            tenants = (await session.execute(text("select id from public.tenants"))).scalars().all()
            convs = (
                (await session.execute(text("select id from public.conversations"))).scalars().all()
            )

        assert tenants == [seed.b.tenant]
        assert convs == [seed.b.conversation]

    async def test_an_unknown_user_sees_nothing(self, engine: AsyncEngine, seed: Seed) -> None:
        assert seed
        async with tenant_session(engine, ctx(uuid.uuid4())) as session:
            count = (
                await session.execute(text("select count(*) from public.conversations"))
            ).scalar()

        assert count == 0

    async def test_the_connection_cannot_escalate_to_another_role(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        with pytest.raises(NotFoundError):  # 42501 is reported as 404, never confirming existence
            async with tenant_session(engine, ctx(seed.a.user)) as session:
                await session.execute(text("set local role service_role"))

    async def test_request_id_is_bound_not_interpolated(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        hostile = "x'; drop table public.tenants; --"
        async with tenant_session(engine, ctx(seed.a.user, hostile)) as session:
            rid = (await session.execute(text("select current_setting('app.request_id')"))).scalar()

        assert rid == hostile

    async def test_settings_do_not_leak_between_requests_on_a_reused_connection(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        async with tenant_session(engine, ctx(seed.a.user, "first")) as session:
            await session.execute(text("select 1"))
        async with engine.connect() as raw:
            role = (await raw.execute(text("select current_user"))).scalar()
            rid = (
                await raw.execute(text("select current_setting('app.request_id', true)"))
            ).scalar()

        assert role == "app_api"
        assert rid in (None, "")

    async def test_writes_commit_and_are_visible_to_a_later_request(
        self, engine: AsyncEngine, seed: Seed, pg_dsn: str
    ) -> None:
        async with tenant_session(engine, ctx(seed.a.user)) as session:
            await session.execute(
                text(
                    "insert into public.rate_limits (tenant_id, scope, window_start, count) "
                    "values (:t, 'layer-test', now(), 1)"
                ),
                {"t": seed.a.tenant},
            )
        try:
            async with tenant_session(engine, ctx(seed.a.user)) as session:
                count = (
                    await session.execute(
                        text("select count(*) from public.rate_limits where scope = 'layer-test'")
                    )
                ).scalar()
            assert count == 1
        finally:
            with psycopg.connect(pg_dsn, autocommit=True) as admin:
                admin.execute("delete from public.rate_limits where scope = 'layer-test'")


class TestSqlstateMapping:
    @pytest.mark.parametrize(
        ("pgcode", "expected", "status"),
        [
            ("23505", ConflictError, 409),
            ("23503", ConflictError, 409),
            ("23514", BusinessRuleError, 422),
            ("22P02", BusinessRuleError, 422),
            ("42501", NotFoundError, 404),
            ("40001", UnavailableError, 503),
            ("40P01", UnavailableError, 503),
            ("57014", GatewayTimeoutError, 504),
        ],
    )
    def test_table_from_the_plan(self, pgcode: str, expected: type, status: int) -> None:
        error = map_db_error(db_error(pgcode))

        assert type(error) is expected
        assert error.status == status

    def test_business_rules_raised_in_sql_keep_their_hint_as_the_message_key(self) -> None:
        error = map_db_error(db_error("P0001", "errors.upload.alreadyConfirmed"))

        assert isinstance(error, BusinessRuleError)
        assert error.message_key == "errors.upload.alreadyConfirmed"

    def test_p0001_without_a_hint_is_not_a_business_rule(self) -> None:
        assert map_db_error(db_error("P0001")).status == 500

    def test_unknown_sqlstates_become_internal_errors_without_leaking_detail(self) -> None:
        error = map_db_error(db_error("XX000"))

        assert error.status == 500
        assert error.message_key == "errors.internal"

    def test_serialization_failures_are_retryable(self) -> None:
        assert map_db_error(db_error("40001")).retryable
        assert not map_db_error(db_error("23505")).retryable


class TestRealDatabaseErrors:
    async def test_duplicate_primary_key_is_a_conflict(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        with pytest.raises(ConflictError):
            async with tenant_session(engine, ctx(seed.a.user)) as session:
                await session.execute(
                    INSERT_OVERRIDE,
                    {"t": seed.a.tenant, "p": seed.a.product},
                )

    async def test_foreign_key_violation_is_a_conflict(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        with pytest.raises(ConflictError):
            async with tenant_session(engine, ctx(seed.a.user)) as session:
                await session.execute(
                    INSERT_OVERRIDE,
                    {"t": seed.a.tenant, "p": uuid.uuid4()},
                )

    async def test_check_violation_is_a_business_rule(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        with pytest.raises(BusinessRuleError):
            async with tenant_session(engine, ctx(seed.a.user)) as session:
                await session.execute(
                    text("update public.product_overrides set lead_time_days = -1"),
                )

    async def test_touching_another_tenant_is_a_not_found(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        with pytest.raises(NotFoundError):
            async with tenant_session(engine, ctx(seed.a.user)) as session:
                await session.execute(
                    INSERT_OVERRIDE,
                    {"t": seed.b.tenant, "p": seed.b.product},
                )

    async def test_statement_timeout_is_a_gateway_timeout(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        async def slow(session: AsyncSession) -> None:
            await session.execute(text("set local statement_timeout = '50ms'"))
            await session.execute(text("select pg_sleep(2)"))

        with pytest.raises(GatewayTimeoutError):
            await run_in_tenant(engine, ctx(seed.a.user), slow)

    async def test_sql_business_rule_keeps_its_hint(self, engine: AsyncEngine, seed: Seed) -> None:
        with pytest.raises(BusinessRuleError) as raised:
            async with tenant_session(engine, ctx(seed.a.user)) as session:
                await session.execute(
                    text(
                        "do $$ begin raise exception 'no' using errcode = 'P0001', "
                        "hint = 'errors.plan.alreadyConfirmed'; end $$"
                    )
                )

        assert raised.value.message_key == "errors.plan.alreadyConfirmed"


class TestRetry:
    async def test_serialization_failure_is_retried_once_then_succeeds(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        attempts = 0

        async def work(session: AsyncSession) -> str:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise db_error("40001")
            return "done"

        assert await run_in_tenant(engine, ctx(seed.a.user), work) == "done"
        assert attempts == 2

    async def test_a_second_serialization_failure_becomes_a_503(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        async def work(session: AsyncSession) -> None:
            raise db_error("40P01")

        with pytest.raises(UnavailableError):
            await run_in_tenant(engine, ctx(seed.a.user), work)

    async def test_other_errors_are_not_retried(self, engine: AsyncEngine, seed: Seed) -> None:
        attempts = 0

        async def work(session: AsyncSession) -> None:
            nonlocal attempts
            attempts += 1
            raise db_error("23505")

        with pytest.raises(ConflictError):
            await run_in_tenant(engine, ctx(seed.a.user), work)
        assert attempts == 1


class TestModels:
    async def test_every_table_has_exactly_one_model(self, engine: AsyncEngine, seed: Seed) -> None:
        assert seed
        async with engine.connect() as raw:
            rows = await raw.execute(
                text("select tablename from pg_tables where schemaname = 'public'")
            )
            tables = {r[0] for r in rows}

        assert set(Base.metadata.tables) == tables

    async def test_every_model_selects_every_mapped_column(
        self, engine: AsyncEngine, seed: Seed
    ) -> None:
        async with tenant_session(engine, ctx(seed.a.user)) as session:
            for mapper in Base.registry.mappers:
                if mapper.class_.__tablename__ == "allowed_emails":
                    continue  # server only: closed to users by design
                await session.execute(select(mapper.class_).limit(1))
