"""Provision a tenant and an invited user from the command line (plan 5, S1).

    PROVISION_DATABASE_URL=postgresql://postgres:...@.../postgres \\
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
    uv run python -m api.provisioning --tenant "Droguería Demo S.A.C." --email ana@empresa.pe

Order matters: the email goes on the allowlist first, because the `before user created` hook rejects
anyone who is not on it. The Auth user is created without sending mail (the user later asks for a
code on the login screen). Every step is idempotent, so a failed run can simply be repeated.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from api.db.engine import create_engine
from api.settings import get_settings

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ROLES = ("owner", "admin", "member")


class ProvisioningError(Exception):
    """A request that cannot be satisfied; the message says what to change."""


@dataclass(frozen=True)
class ProvisionRequest:
    email: str
    tenant_name: str | None = None
    tenant_id: UUID | None = None
    full_name: str = ""
    role: str | None = None
    """Default: `owner` for the first member of a new tenant, `member` otherwise."""

    def __post_init__(self) -> None:
        if (self.tenant_name is None) == (self.tenant_id is None):
            message = "give exactly one of tenant name or tenant id"
            raise ProvisioningError(message)
        email = self.email.strip().lower()
        if not _EMAIL.match(email):
            message = f"invalid email: {self.email!r}"
            raise ProvisioningError(message)
        object.__setattr__(self, "email", email)
        if self.role is not None and self.role not in _ROLES:
            message = f"role must be one of {_ROLES}"
            raise ProvisioningError(message)


@dataclass(frozen=True)
class ProvisionResult:
    tenant_id: UUID
    user_id: UUID
    tenant_created: bool
    user_created: bool
    member_added: bool


class AuthAdmin(Protocol):
    """The part of Supabase Auth the script needs."""

    async def create_user(self, email: str) -> UUID: ...


class SupabaseAuthAdmin:
    """Creates a confirmed user through the Auth Admin API (service role key)."""

    def __init__(self, client: Any) -> None:
        self.client = client

    async def create_user(self, email: str) -> UUID:
        response = await asyncio.to_thread(
            self.client.auth.admin.create_user, {"email": email, "email_confirm": True}
        )
        return UUID(str(response.user.id))


async def _resolve_tenant(conn: AsyncConnection, request: ProvisionRequest) -> tuple[UUID, bool]:
    if request.tenant_id is not None:
        found = (
            (
                await conn.execute(
                    text("select id from public.tenants where id = :i"), {"i": request.tenant_id}
                )
            )
            .scalars()
            .all()
        )
        if not found:
            message = f"tenant {request.tenant_id} not found"
            raise ProvisioningError(message)
        return request.tenant_id, False
    named = (
        (
            await conn.execute(
                text("select id from public.tenants where name = :n"), {"n": request.tenant_name}
            )
        )
        .scalars()
        .all()
    )
    if len(named) > 1:
        message = f"{len(named)} tenants are named {request.tenant_name!r}: use --tenant-id"
        raise ProvisioningError(message)
    if named:
        return named[0], False
    created = await conn.execute(
        text("insert into public.tenants (name) values (:n) returning id"),
        {"n": request.tenant_name},
    )
    return created.scalar_one(), True


async def _prepare(
    conn: AsyncConnection, request: ProvisionRequest
) -> tuple[UUID, bool, UUID | None]:
    """Checks, tenant and allowlist in one transaction. Returns the existing Auth user, if any."""
    owner = (
        await conn.execute(
            text("select tenant_id from public.allowed_emails where lower(email::text) = :e"),
            {"e": request.email},
        )
    ).scalar()
    tenant_id, created = await _resolve_tenant(conn, request)
    if owner is not None and owner != tenant_id:
        message = f"{request.email} is already invited to another tenant"
        raise ProvisioningError(message)
    user_id = (
        await conn.execute(
            text("select id from auth.users where lower(email) = :e"), {"e": request.email}
        )
    ).scalar()
    if user_id is not None:
        member_of = (
            await conn.execute(
                text("select tenant_id from public.tenant_members where user_id = :u"),
                {"u": user_id},
            )
        ).scalar()
        if member_of is not None and member_of != tenant_id:
            message = f"{request.email} already belongs to another tenant"
            raise ProvisioningError(message)
    if owner is None:
        await conn.execute(
            text(
                "insert into public.allowed_emails (tenant_id, email) values (:t, cast(:e as text))"
            ),
            {"t": tenant_id, "e": request.email},
        )
    return tenant_id, created, user_id


async def provision(
    engine: AsyncEngine, auth: AuthAdmin, request: ProvisionRequest
) -> ProvisionResult:
    async with engine.begin() as conn:
        tenant_id, tenant_created, user_id = await _prepare(conn, request)

    user_created = user_id is None
    if user_id is None:
        user_id = await auth.create_user(request.email)

    role = request.role or ("owner" if tenant_created else "member")
    async with engine.begin() as conn:
        added = await conn.execute(
            text(
                "insert into public.tenant_members (tenant_id, user_id, role) "
                "values (:t, :u, :r) on conflict do nothing"
            ),
            {"t": tenant_id, "u": user_id, "r": role},
        )
        await conn.execute(
            text(
                "insert into public.profiles (user_id, full_name) values (:u, :n) "
                "on conflict do nothing"
            ),
            {"u": user_id, "n": request.full_name},
        )
    return ProvisionResult(
        tenant_id=tenant_id,
        user_id=user_id,
        tenant_created=tenant_created,
        user_created=user_created,
        member_added=added.rowcount == 1,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Provision a tenant and an invited user.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--tenant", help="tenant name (created when it does not exist)")
    group.add_argument("--tenant-id", type=UUID, help="existing tenant id")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="", help="full name for the profile")
    parser.add_argument("--role", choices=_ROLES)
    return parser


async def _run(args: argparse.Namespace, database_url: str) -> ProvisionResult:
    from supabase import create_client  # noqa: PLC0415 - only the CLI needs the Supabase client

    settings = get_settings()
    auth = SupabaseAuthAdmin(
        create_client(settings.supabase_url, settings.supabase_service_role_key)
    )
    engine = create_engine(database_url, pool_size=1)
    try:
        request = ProvisionRequest(
            email=args.email,
            tenant_name=args.tenant,
            tenant_id=args.tenant_id,
            full_name=args.name,
            role=args.role,
        )
        return await provision(engine, auth, request)
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    database_url = os.environ.get("PROVISION_DATABASE_URL", "")
    if not database_url:
        sys.stderr.write("PROVISION_DATABASE_URL is required (an admin connection, not app_api)\n")
        return 2
    try:
        result = asyncio.run(_run(args, database_url))
    except ProvisioningError as error:
        sys.stderr.write(f"error: {error}\n")
        return 1
    state = "created" if result.tenant_created else "existing"
    sys.stdout.write(
        f"tenant {result.tenant_id} ({state})\n"
        f"user {result.user_id} ({'created' if result.user_created else 'existing'})\n"
        f"membership {'added' if result.member_added else 'already present'}\n"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
