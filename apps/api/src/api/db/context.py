"""Per-request tenant transaction (plan 5, "Multi-tenancy").

The API connects as `app_api`, which cannot bypass RLS. Each request runs in one transaction that
switches to the `authenticated` role and carries the verified JWT claims and the request id, so
`auth.uid()`, the RLS policies and the audit triggers all see the real user.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, Awaitable, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from api.db.errors import map_db_error
from api.domain.errors import AppError

_SET_CONTEXT = text(
    "select set_config('request.jwt.claims', :claims, true), "
    "set_config('request.jwt.claim.sub', :sub, true), "
    "set_config('app.request_id', :request_id, true)"
)


@dataclass(frozen=True)
class RequestContext:
    """Who is calling, from an already verified token."""

    user_id: UUID
    claims: Mapping[str, object]
    request_id: str | None = None


@asynccontextmanager
async def tenant_session(engine: AsyncEngine, ctx: RequestContext) -> AsyncGenerator[AsyncSession]:
    """One transaction as `ctx.user_id`. Commits on success, rolls back on error.

    Database errors leave as `AppError`s (SQLSTATE mapping). Values are bound, never interpolated.
    """
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session, session.begin():
            await session.execute(text("set local role authenticated"))
            await session.execute(
                _SET_CONTEXT,
                {
                    "claims": json.dumps({**ctx.claims, "sub": str(ctx.user_id)}),
                    "sub": str(ctx.user_id),
                    "request_id": ctx.request_id or "",
                },
            )
            yield session
    except DBAPIError as error:
        raise map_db_error(error) from error


async def run_in_tenant[T](
    engine: AsyncEngine,
    ctx: RequestContext,
    work: Callable[[AsyncSession], Awaitable[T]],
    *,
    retries: int = 1,
) -> T:
    """Run `work` in a tenant transaction, retrying serialization failures and deadlocks once."""
    attempt = 0
    while True:
        try:
            async with tenant_session(engine, ctx) as session:
                return await work(session)
        except AppError as error:
            if not (error.retryable and attempt < retries):
                raise
        attempt += 1
