"""Business audit events (`audit.log_event`), written from the service layer, never from routers."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal

_LOG = text(
    "select audit.log_event("
    ":tenant_id, :action, :target_type, :target_id, cast(:metadata as jsonb))"
)


async def log_event(  # noqa: PLR0913
    session: AsyncSession,
    who: Principal,
    action: str,
    target_type: str,
    target_id: object,
    *,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Ids and counts only: never file contents or chat text."""
    await session.execute(
        _LOG,
        {
            "tenant_id": who.tenant_id,
            "action": action,
            "target_type": target_type,
            "target_id": str(target_id),
            "metadata": json.dumps(metadata or {}),
        },
    )
