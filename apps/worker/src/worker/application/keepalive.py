"""Daily keep-alive for the pilot on Supabase Free (R14): the project pauses after a week of no
activity, so something touches the database every day. A failure raises, which makes the platform
alert, and the log line lands in Axiom."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import structlog


class KeepaliveError(Exception):
    """The database or the API did not answer."""


@dataclass(frozen=True)
class KeepaliveResult:
    database_ok: bool
    api_ok: bool | None
    """None when no API check was configured."""


def keepalive(
    ping_database: Callable[[], object], check_api: Callable[[], bool] | None
) -> KeepaliveResult:
    log = structlog.get_logger()
    try:
        ping_database()
    except Exception as error:
        log.error("keepalive.database_down", error=type(error).__name__)
        message = "the database did not answer"
        raise KeepaliveError(message) from error
    api_ok: bool | None = None
    if check_api is not None:
        api_ok = bool(check_api())
        if not api_ok:
            log.error("keepalive.api_not_ready")
            message = "the API is not ready"
            raise KeepaliveError(message)
    log.info("keepalive.ok")
    return KeepaliveResult(True, api_ok)
