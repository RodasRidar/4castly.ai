"""One place that maps PostgreSQL errors to application errors (plan 7b table)."""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.exc import DBAPIError

from api.domain.errors import (
    AppError,
    BusinessRuleError,
    ConflictError,
    GatewayTimeoutError,
    NotFoundError,
    UnavailableError,
)

_UNIQUE_VIOLATION = "23505"
_FOREIGN_KEY_VIOLATION = "23503"
_CHECK_VIOLATION = "23514"
_INVALID_TEXT = "22P02"
_INSUFFICIENT_PRIVILEGE = "42501"  # RLS denial: reported as 404 so existence is never confirmed
_SERIALIZATION_FAILURE = "40001"
_DEADLOCK = "40P01"
_QUERY_CANCELED = "57014"  # statement timeout
_RAISE_EXCEPTION = "P0001"


def sqlstate(error: DBAPIError) -> str | None:
    return getattr(error.orig, "pgcode", None) or getattr(error.orig, "sqlstate", None)


def _hint(error: DBAPIError) -> str | None:
    cause = getattr(error.orig, "__cause__", None)
    return getattr(cause, "hint", None) or getattr(error.orig, "hint", None)


def _retryable_unavailable() -> AppError:
    mapped = UnavailableError()
    mapped.retryable = True
    return mapped


_BY_SQLSTATE: dict[str, Callable[[], AppError]] = {
    _UNIQUE_VIOLATION: ConflictError,
    _FOREIGN_KEY_VIOLATION: ConflictError,
    _CHECK_VIOLATION: BusinessRuleError,
    _INVALID_TEXT: BusinessRuleError,
    _INSUFFICIENT_PRIVILEGE: NotFoundError,
    _SERIALIZATION_FAILURE: _retryable_unavailable,
    _DEADLOCK: _retryable_unavailable,
    _QUERY_CANCELED: GatewayTimeoutError,
}


def map_db_error(error: DBAPIError) -> AppError:
    """Translate a driver error. Detail from the database is never copied into the result."""
    code = sqlstate(error)
    if code in _BY_SQLSTATE:
        return _BY_SQLSTATE[code]()
    if code == _RAISE_EXCEPTION and (hint := _hint(error)):
        return BusinessRuleError(hint)
    return AppError()
