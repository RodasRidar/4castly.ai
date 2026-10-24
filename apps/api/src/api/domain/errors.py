"""Application errors. Services raise these, never `HTTPException`; handlers turn them into
problem details (plan 7b)."""

from __future__ import annotations


class AppError(Exception):
    """Base class: carries what the problem-details response needs."""

    status: int = 500
    code: str = "internal_error"
    message_key: str = "errors.internal"
    retryable: bool = False

    def __init__(self, message_key: str | None = None) -> None:
        super().__init__(message_key or self.message_key)
        if message_key:
            self.message_key = message_key


class NotFoundError(AppError):
    """Also used for another tenant's resource: never confirm that it exists."""

    status = 404
    code = "not_found"
    message_key = "errors.notFound"


class ForbiddenError(AppError):
    status = 403
    code = "forbidden"
    message_key = "errors.forbidden"


class ConflictError(AppError):
    status = 409
    code = "conflict"
    message_key = "errors.conflict"


class BusinessRuleError(AppError):
    """A rule the input broke (check constraint, invalid text, or a rule raised in SQL)."""

    status = 422
    code = "business_rule"
    message_key = "errors.validation"


class UnavailableError(AppError):
    status = 503
    code = "unavailable"
    message_key = "errors.unavailable"


class GatewayTimeoutError(AppError):
    status = 504
    code = "timeout"
    message_key = "errors.timeout"


class UnauthenticatedError(AppError):
    """Missing, malformed, expired or untrusted token."""

    status = 401
    code = "unauthenticated"
    message_key = "errors.unauthenticated"


class TooManyRequestsError(AppError):
    status = 429
    code = "rate_limited"
    message_key = "errors.rateLimited"


class AssistantUnavailableError(AppError):
    """The language model could not answer (outage, overload, too many tool rounds)."""

    status = 503
    code = "assistant_unavailable"
    message_key = "errors.assistantUnavailable"
    retryable = True
