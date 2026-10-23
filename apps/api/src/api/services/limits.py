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
