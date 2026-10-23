"""Synchronous engine for the worker (CPU-bound pipeline) behind the Supabase pooler."""

from __future__ import annotations

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url

CONNECT_TIMEOUT_SECONDS = 10


def create_worker_engine(database_url: str, *, pool_size: int = 2) -> Engine:
    """Connects as `app_worker`. The pooler runs in transaction mode, so prepared statements are
    disabled."""
    url = make_url(database_url)
    if url.get_backend_name() != "postgresql":
        message = "DATABASE_URL must be a PostgreSQL URL"
        raise ValueError(message)
    return create_engine(
        url.set(drivername="postgresql+psycopg"),
        pool_size=pool_size,
        max_overflow=0,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"prepare_threshold": None, "connect_timeout": CONNECT_TIMEOUT_SECONDS},
    )
