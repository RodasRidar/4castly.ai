"""Replay protection (R7): the same `Idempotency-Key` returns the first response for 24 hours.

`replay` runs before the work and `save` after it, in the same transaction, so a failed request
leaves no key behind. The table is insert-only for the API, so two racing requests with one key end
in a unique violation (409) and the loser's work is rolled back.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import ConflictError

TTL_HOURS = 24

_FIND = text(
    "select request_hash, response from public.idempotency_keys "
    "where tenant_id = :tenant_id and key = :key and expires_at > now()"
)
_SAVE = text(
    "insert into public.idempotency_keys (tenant_id, key, request_hash, response, expires_at) "
    "values (:tenant_id, :key, :hash, cast(:response as jsonb), "
    "now() + make_interval(hours => :ttl))"
)


def request_hash(operation: str, target: str, body: Any) -> str:
    payload = json.dumps([operation, target, body], sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


async def replay(
    session: AsyncSession, who: Principal, key: str, hash_: str
) -> dict[str, Any] | None:
    """The stored response for this key, `None` if unused. A different request is a conflict."""
    row = (await session.execute(_FIND, {"tenant_id": who.tenant_id, "key": key})).one_or_none()
    if row is None:
        return None
    if row.request_hash != hash_ or row.response is None:
        raise ConflictError("errors.idempotencyKeyReused")
    return dict(row.response)


async def save(
    session: AsyncSession, who: Principal, key: str, hash_: str, response: dict[str, Any]
) -> None:
    await session.execute(
        _SAVE,
        {
            "tenant_id": who.tenant_id,
            "key": key,
            "hash": hash_,
            "response": json.dumps(response, default=str),
            "ttl": TTL_HOURS,
        },
    )
