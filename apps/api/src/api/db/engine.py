"""Async engine tuned for a serverless API behind the Supabase pooler (plan 7b, 13)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

CONNECT_TIMEOUT_SECONDS = 5
COMMAND_TIMEOUT_SECONDS = 15


def _asyncpg_url(database_url: str) -> str:
    url = make_url(database_url)
    if url.get_backend_name() != "postgresql":
        message = "DATABASE_URL must be a PostgreSQL URL"
        raise ValueError(message)
    return url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)


def engine_options(database_url: str, *, pool_size: int = 2) -> dict[str, Any]:
    """Keyword arguments for `create_async_engine`.

    The Supabase pooler runs in transaction mode, which cannot keep prepared statements, so
    asyncpg's statement cache is disabled. Pools stay small: every serverless instance has its own.
    """
    return {
        "url": _asyncpg_url(database_url),
        "pool_size": pool_size,
        "max_overflow": 0,
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "connect_args": {
            "statement_cache_size": 0,
            "timeout": CONNECT_TIMEOUT_SECONDS,
            "command_timeout": COMMAND_TIMEOUT_SECONDS,
        },
    }


def create_engine(database_url: str, *, pool_size: int = 2) -> AsyncEngine:
    return create_async_engine(**engine_options(database_url, pool_size=pool_size))
