"""Request authentication (S4): verify the bearer token, then resolve the tenant from membership.

The tenant never comes from the request. `Principal` is what services receive; `Tx` runs their SQL
in one tenant transaction (RLS applies, plan 5).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.container import Container
from api.db.context import RequestContext, run_in_tenant
from api.domain.errors import ForbiddenError, UnauthenticatedError, UnavailableError
from api.observability.context import bind_identity, current_request_id
from api.routers._common import bearer_scheme

_MEMBERSHIP = text("select tenant_id, role from public.tenant_members where user_id = :user_id")


@dataclass(frozen=True)
class Principal:
    ctx: RequestContext
    tenant_id: UUID
    role: str
    email: str | None

    @property
    def user_id(self) -> UUID:
        return self.ctx.user_id


@dataclass(frozen=True)
class Tx:
    """A principal plus the means to run work as them."""

    who: Principal
    container: Container

    async def run[**P, T](
        self,
        work: Callable[..., Awaitable[T]],
        *args: Any,
    ) -> T:
        """Run `work(session, principal, *args)` in one tenant transaction."""

        async def call(session: AsyncSession) -> T:
            return await work(session, self.who, *args)

        engine = self.container.engine
        if engine is None:
            raise UnavailableError
        return await run_in_tenant(engine, self.who.ctx, call)


def get_container(request: Request) -> Container:
    return request.app.state.container


async def get_principal(
    container: Annotated[Container, Depends(get_container)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Principal:
    if credentials is None or not credentials.credentials.strip():
        raise UnauthenticatedError
    claims = await container.verifier.verify(credentials.credentials)
    try:
        user_id = UUID(str(claims["sub"]))
    except (KeyError, ValueError) as error:
        raise UnauthenticatedError from error
    ctx = RequestContext(user_id=user_id, claims=claims, request_id=current_request_id())
    if container.engine is None:
        raise UnavailableError

    async def membership(session: AsyncSession) -> tuple[UUID, str] | None:
        row = (await session.execute(_MEMBERSHIP, {"user_id": user_id})).one_or_none()
        return (row.tenant_id, row.role) if row else None

    found = await run_in_tenant(container.engine, ctx, membership)
    if found is None:
        raise ForbiddenError
    tenant_id, role = found
    bind_identity(tenant_id, user_id)
    email = claims.get("email")
    return Principal(ctx, tenant_id, role, email if isinstance(email, str) else None)


def get_tx(
    who: Annotated[Principal, Depends(get_principal)],
    container: Annotated[Container, Depends(get_container)],
) -> Tx:
    return Tx(who, container)


CurrentTx = Annotated[Tx, Depends(get_tx)]
