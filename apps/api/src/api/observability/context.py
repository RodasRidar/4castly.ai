"""Request-scoped identifiers shared by logs, problem details and traces (contextvars)."""

from __future__ import annotations

from uuid import UUID

import structlog


def current_request_id() -> str | None:
    value = structlog.contextvars.get_contextvars().get("request_id")
    return str(value) if value else None


def bind_identity(tenant_id: UUID, user_id: UUID) -> None:
    """Called once auth resolves the caller; every later log line carries both ids."""
    structlog.contextvars.bind_contextvars(tenant_id=str(tenant_id), user_id=str(user_id))
