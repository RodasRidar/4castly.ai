"""Exception handlers: every error leaves the API as RFC 9457 `application/problem+json`."""

from __future__ import annotations

import secrets
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.domain.errors import AppError
from api.observability.context import current_request_id
from api.schemas import ApiError, FieldIssue

PROBLEM_JSON = "application/problem+json"
_REF_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"  # no 0/O, 1/I/L: read aloud to support
_REF_LENGTH = 6

_HTTP_ERRORS: dict[int, tuple[str, str]] = {
    401: ("unauthenticated", "errors.unauthenticated"),
    403: ("forbidden", "errors.forbidden"),
    404: ("not_found", "errors.notFound"),
    405: ("method_not_allowed", "errors.methodNotAllowed"),
    409: ("conflict", "errors.conflict"),
    413: ("payload_too_large", "errors.payloadTooLarge"),
    429: ("rate_limited", "errors.rateLimited"),
}


def new_ref() -> str:
    return "".join(secrets.choice(_REF_ALPHABET) for _ in range(_REF_LENGTH))


def problem_response(
    *,
    status: int,
    code: str,
    message_key: str,
    fields: list[FieldIssue] | None = None,
    request_id: str | None = None,
) -> JSONResponse:
    body = ApiError(
        title=HTTPStatus(status).phrase,
        status=status,
        code=code,
        message_key=message_key,
        ref=new_ref(),
        request_id=request_id or current_request_id(),
        fields=fields or [],
    )
    return JSONResponse(body.model_dump(mode="json"), status_code=status, media_type=PROBLEM_JSON)


def problem(
    request: Request,
    *,
    status: int,
    code: str,
    message_key: str,
    fields: list[FieldIssue] | None = None,
) -> JSONResponse:
    return problem_response(
        status=status,
        code=code,
        message_key=message_key,
        fields=fields,
        request_id=current_request_id() or request.headers.get("x-request-id"),
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, error: AppError) -> JSONResponse:
        return problem(request, status=error.status, code=error.code, message_key=error.message_key)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, error: RequestValidationError) -> JSONResponse:
        fields = [
            FieldIssue(field=".".join(str(part) for part in issue["loc"][1:]), code=issue["type"])
            for issue in error.errors()
        ]
        return problem(
            request,
            status=422,
            code="validation_error",
            message_key="errors.validation",
            fields=fields,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, error: StarletteHTTPException) -> JSONResponse:
        code, key = _HTTP_ERRORS.get(error.status_code, ("http_error", "errors.generic"))
        return problem(request, status=error.status_code, code=code, message_key=key)
