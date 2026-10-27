"""Fixed-window rate limits per user and action (S20), counted in Postgres because serverless
instances share no memory. A refused request rolls its transaction back, so it is not counted."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import TooManyRequestsError

# Counters are written only by these functions (migration 0004): `rate_limits` is read-only for
# members, and the functions refuse any connection that is not the API's.
_HIT = text("select public.rate_limit_hit(:action, :window)")

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
    del who  # the function counts for the verified session's user
    count = (await session.execute(_HIT, {"action": action, "window": window_seconds})).scalar_one()
    if count > limit:
        raise TooManyRequestsError


TENANT_DAILY_TOKENS = 200_000
"""Model tokens (input + output) a tenant may spend per UTC day on the assistant (S18)."""

_TOKENS_SCOPE = "tenant:tokens"
_TODAY = "to_timestamp(floor(extract(epoch from now()) / 86400) * 86400)"
_SPENT = text(
    "select coalesce(sum(count), 0) from public.rate_limits "  # noqa: S608 - constant fragment
    f"where tenant_id = :tenant_id and scope = :scope and window_start = {_TODAY}"
)
_SPEND = text("select public.spend_tokens(:amount)")


async def ensure_token_budget(session: AsyncSession, who: Principal) -> None:
    """Refuse a new assistant turn once the tenant has spent today's tokens."""
    spent = (
        await session.execute(_SPENT, {"tenant_id": who.tenant_id, "scope": _TOKENS_SCOPE})
    ).scalar_one()
    if spent >= TENANT_DAILY_TOKENS:
        raise TooManyRequestsError("errors.dailyTokenLimit")


async def spend_tokens(session: AsyncSession, who: Principal, tokens: int) -> None:
    """Add a finished turn's tokens to today's tenant counter."""
    del who  # the function derives the tenant from the verified session
    if tokens > 0:
        await session.execute(_SPEND, {"amount": tokens})
