"""Application errors. Services raise these, never `HTTPException`; handlers turn them into
problem details (plan 7b). B2b extends the hierarchy (NotFound, Conflict, Forbidden, ...)."""


class AppError(Exception):
    """Base class: carries what the problem-details response needs."""

    status: int = 500
    code: str = "internal_error"
    message_key: str = "errors.internal"


class NotImplementedYetError(AppError):
    """Endpoint is in the contract but not built yet (until phase B4)."""

    status = 501
    code = "not_implemented"
    message_key = "errors.notImplemented"
