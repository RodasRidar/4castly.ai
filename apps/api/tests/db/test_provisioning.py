"""Provisioning a tenant and an invited user (plan 5): allowlist first, then the Auth user."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from api.provisioning import (
    ProvisioningError,
    ProvisionRequest,
    SupabaseAuthAdmin,
    main,
    provision,
)

from .seed import Seed


@pytest_asyncio.fixture
async def admin(pg_dsn: str, seed: Seed) -> AsyncIterator[AsyncEngine]:
    """A superuser engine (the script runs with an admin URL), cleaned up after each test."""
    assert seed
    parts = dict(item.split("=", 1) for item in pg_dsn.split())
    url = f"postgresql+asyncpg://postgres@{parts['host']}:{parts['port']}/{parts['dbname']}"
    engine = create_async_engine(url)
    yield engine
    async with engine.begin() as conn:
        await conn.execute(text("delete from public.tenants where name like 'Prov %'"))
        await conn.execute(text("delete from auth.users where email like '%@prov.test'"))
    await engine.dispose()


class FakeAuthAdmin:
    """Stands in for GoTrue: creates the user, but the signup hook can veto it like the real one."""

    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.created: list[str] = []

    async def create_user(self, email: str) -> uuid.UUID:
        async with self.engine.begin() as conn:
            verdict = (
                await conn.execute(
                    text("select public.hook_restrict_signup(cast(:event as jsonb))"),
                    {"event": f'{{"user": {{"email": "{email}"}}}}'},
                )
            ).scalar()
            if verdict:
                message = f"signup rejected by the hook: {verdict}"
                raise RuntimeError(message)
            user_id = uuid.uuid4()
            await conn.execute(
                text("insert into auth.users (id, email) values (:i, :e)"),
                {"i": user_id, "e": email},
            )
        self.created.append(email)
        return user_id


async def rows(engine: AsyncEngine, sql: str, **params: object) -> list[dict]:
    async with engine.connect() as conn:
        result = await conn.execute(text(sql), params)
        return [dict(r._mapping) for r in result]


def request(**overrides: object) -> ProvisionRequest:
    base = {"tenant_name": "Prov Uno", "email": "ana@prov.test", "full_name": "Ana Prov"}
    return ProvisionRequest(**{**base, **overrides})  # ty: ignore[invalid-argument-type]


async def test_creates_tenant_allowlist_user_membership_and_profile(admin: AsyncEngine) -> None:
    auth = FakeAuthAdmin(admin)

    result = await provision(admin, auth, request())

    assert result.tenant_created
    assert result.user_created
    assert result.member_added
    [member] = await rows(
        admin, "select role from public.tenant_members where user_id = :u", u=result.user_id
    )
    assert member["role"] == "owner"  # first member of a new tenant
    [profile] = await rows(
        admin, "select full_name from public.profiles where user_id = :u", u=result.user_id
    )
    assert profile["full_name"] == "Ana Prov"
    [allowed] = await rows(
        admin, "select tenant_id from public.allowed_emails where email = 'ana@prov.test'"
    )
    assert allowed["tenant_id"] == result.tenant_id
    assert auth.created == ["ana@prov.test"]


async def test_the_allowlist_is_written_before_the_auth_user_is_created(admin: AsyncEngine) -> None:
    class Recorder(FakeAuthAdmin):
        def __init__(self, engine: AsyncEngine) -> None:
            super().__init__(engine)
            self.allowed_when_called: list[dict] = []

        async def create_user(self, email: str) -> uuid.UUID:
            self.allowed_when_called = await rows(
                admin, "select email from public.allowed_emails where email = :e", e=email
            )
            return await super().create_user(email)

    auth = Recorder(admin)

    await provision(admin, auth, request())

    assert [r["email"] for r in auth.allowed_when_called] == ["ana@prov.test"]


async def test_running_twice_changes_nothing_the_second_time(admin: AsyncEngine) -> None:
    auth = FakeAuthAdmin(admin)
    first = await provision(admin, auth, request())

    second = await provision(admin, auth, request())

    assert (second.tenant_id, second.user_id) == (first.tenant_id, first.user_id)
    assert not second.tenant_created
    assert not second.user_created
    assert not second.member_added
    assert auth.created == ["ana@prov.test"]
    [count] = await rows(admin, "select count(*) as n from public.tenants where name = 'Prov Uno'")
    assert count["n"] == 1


async def test_a_second_user_joins_an_existing_tenant_as_a_member(admin: AsyncEngine) -> None:
    auth = FakeAuthAdmin(admin)
    first = await provision(admin, auth, request())

    second = await provision(
        admin,
        auth,
        request(
            email="beto@prov.test", full_name="Beto", tenant_name=None, tenant_id=first.tenant_id
        ),
    )

    assert second.tenant_id == first.tenant_id
    assert not second.tenant_created
    [member] = await rows(
        admin, "select role from public.tenant_members where user_id = :u", u=second.user_id
    )
    assert member["role"] == "member"


async def test_emails_are_normalised(admin: AsyncEngine) -> None:
    await provision(admin, FakeAuthAdmin(admin), request(email="  Ana@PROV.test "))

    [allowed] = await rows(
        admin, "select email::text as e from public.allowed_emails where email = 'ana@prov.test'"
    )
    assert allowed["e"] == "ana@prov.test"


async def test_an_email_already_invited_to_another_tenant_is_refused_without_side_effects(
    admin: AsyncEngine, seed: Seed
) -> None:
    with pytest.raises(ProvisioningError, match="another tenant"):
        await provision(
            admin, FakeAuthAdmin(admin), request(tenant_name="Prov Dos", email=seed.a.email)
        )

    assert await rows(admin, "select 1 from public.tenants where name = 'Prov Dos'") == []


async def test_a_user_who_belongs_to_another_tenant_is_refused(
    admin: AsyncEngine, seed: Seed
) -> None:
    async with admin.begin() as conn:
        await conn.execute(
            text("update auth.users set email = 'x@prov.test' where id = :u"), {"u": seed.a2_user}
        )
    try:
        with pytest.raises(ProvisioningError, match="already belongs"):
            await provision(
                admin,
                FakeAuthAdmin(admin),
                request(tenant_name=None, tenant_id=seed.b.tenant, email="x@prov.test"),
            )
    finally:
        async with admin.begin() as conn:
            await conn.execute(
                text("delete from public.allowed_emails where email = 'x@prov.test'")
            )
            await conn.execute(
                text("update auth.users set email = 'ana2@example.com' where id = :u"),
                {"u": seed.a2_user},
            )


async def test_an_ambiguous_tenant_name_asks_for_an_id(admin: AsyncEngine) -> None:
    async with admin.begin() as conn:
        await conn.execute(
            text("insert into public.tenants (name) values ('Prov Gemela'), ('Prov Gemela')")
        )

    with pytest.raises(ProvisioningError, match="--tenant-id"):
        await provision(admin, FakeAuthAdmin(admin), request(tenant_name="Prov Gemela"))


async def test_an_unknown_tenant_id_is_refused(admin: AsyncEngine) -> None:
    with pytest.raises(ProvisioningError, match="not found"):
        await provision(
            admin, FakeAuthAdmin(admin), request(tenant_name=None, tenant_id=uuid.uuid4())
        )


@pytest.mark.parametrize("email", ["not-an-email", "a@b", "", "two@@x.com"])
async def test_invalid_emails_are_refused(admin: AsyncEngine, email: str) -> None:
    with pytest.raises(ProvisioningError, match="email"):
        await provision(admin, FakeAuthAdmin(admin), request(email=email))


def test_a_request_needs_exactly_one_tenant_selector() -> None:
    with pytest.raises(ProvisioningError, match="exactly one"):
        ProvisionRequest(tenant_name=None, tenant_id=None, email="a@prov.test")
    with pytest.raises(ProvisioningError, match="exactly one"):
        ProvisionRequest(tenant_name="x", tenant_id=uuid.uuid4(), email="a@prov.test")


class TestSupabaseAuthAdmin:
    async def test_creates_a_confirmed_user_without_sending_mail(self) -> None:
        calls: list[dict] = []
        user_id = uuid.uuid4()

        class Admin:
            def create_user(self, attributes: dict) -> object:
                calls.append(attributes)
                return type("Resp", (), {"user": type("U", (), {"id": str(user_id)})()})()

        client = type("Client", (), {"auth": type("Auth", (), {"admin": Admin()})()})()

        created = await SupabaseAuthAdmin(client).create_user("ana@prov.test")

        assert created == user_id
        assert calls == [{"email": "ana@prov.test", "email_confirm": True}]


class TestCli:
    def test_missing_arguments_exit_with_usage_error(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        with pytest.raises(SystemExit) as raised:
            main(["--email", "a@prov.test"])

        assert raised.value.code == 2
        assert "--tenant" in capsys.readouterr().err

    def test_without_an_admin_database_url_it_refuses_to_run(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.delenv("PROVISION_DATABASE_URL", raising=False)

        code = main(["--tenant", "Prov", "--email", "a@prov.test"])

        assert code == 2
        assert "PROVISION_DATABASE_URL" in capsys.readouterr().err
