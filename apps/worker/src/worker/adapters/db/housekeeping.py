"""Periodic cleanup of rows nothing else removes. Time comes from the database."""

from __future__ import annotations

from sqlalchemy import Engine, text

_PURGE_IDEMPOTENCY = text("delete from public.idempotency_keys where expires_at <= now()")


class SqlHousekeeping:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def purge_expired_idempotency_keys(self) -> int:
        """Delete keys past their 24 h window (the API ignores them already); returns the count."""
        with self._engine.begin() as conn:
            return conn.execute(_PURGE_IDEMPOTENCY).rowcount
