"""Fixed-window rate limits per user and action (S20), counted in Postgres because serverless
instances share no memory. A refused request rolls its transaction back, so it is not counted."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import TooManyRequestsError

_HIT = text(
    "insert into public.rate_limits (tenant_id, scope, window_start, count) "
    "values (:tenant_id, :scope, "
    "to_timestamp(floor(extract(epoch from now()) / cast(:window as double precision)) "
    "* cast(:window as double precision)), 1) "
    "on conflict (tenant_id, scope, window_start) "
    "do update set count = public.rate_limits.count + 1 returning count"
)

# Generous defaults for a pilot; tuned from Axiom once there is real traffic.
UPLOAD_LIMIT = (30, 3600)
FORECAST_LIMIT = (30, 3600)
EXPORT_LIMIT = (60, 3600)
CHAT_LIMIT = (60, 3600)
"""Messages per user per hour (S18); also bounded by `max_tokens` on every turn."""


async def enforce(
    session: AsyncSession, who: Principal, action: str, *, limit: int, window_seconds: int
) -> None:
    """Count one request; raise `TooManyRequestsError` past `limit` in the current window."""
    count = (
        await session.execute(
            _HIT,
            {
                "tenant_id": who.tenant_id,
                "scope": f"user:{who.user_id}:{action}",
                "window": window_seconds,
            },
        )
    ).scalar_one()
    if count > limit:
        raise TooManyRequestsError


TENANT_DAILY_TOKENS = 200_000
"""Model tokens (input + output) a tenant may spend per UTC day on the assistant (S18)."""

_TOKENS_SCOPE = "tenant:tokens"
_TODAY = "to_timestamp(floor(extract(epoch from now()) / 86400) * 86400)"
_SPENT = text(
    "select coalesce(sum(count), 0) from public.rate_limits "  # noqa: S608 - constant fragment
    f"where scope = :scope and window_start = {_TODAY}"
)
_SPEND = text(
    "insert into public.rate_limits (tenant_id, scope, window_start, count) "  # noqa: S608
    f"values (:tenant_id, :scope, {_TODAY}, :amount) "
    "on conflict (tenant_id, scope, window_start) "
    "do update set count = public.rate_limits.count + :amount"
)


async def ensure_token_budget(session: AsyncSession) -> None:
    """Refuse a new assistant turn once the tenant has spent today's tokens."""
    spent = (await session.execute(_SPENT, {"scope": _TOKENS_SCOPE})).scalar_one()
    if spent >= TENANT_DAILY_TOKENS:
        raise TooManyRequestsError("errors.dailyTokenLimit")


async def spend_tokens(session: AsyncSession, who: Principal, tokens: int) -> None:
    """Add a finished turn's tokens to today's tenant counter."""
    if tokens > 0:
        await session.execute(
            _SPEND, {"tenant_id": who.tenant_id, "scope": _TOKENS_SCOPE, "amount": tokens}
        )
