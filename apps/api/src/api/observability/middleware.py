"""Pure ASGI middlewares (no BaseHTTPMiddleware: it breaks streaming and contextvars)."""

from __future__ import annotations

import re
import time
from uuid import uuid4

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api.errors import problem_response

REQUEST_ID_HEADER = b"x-request-id"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_SERVER_ERROR = 500


class RequestIdMiddleware:
    """Accept a well-formed `X-Request-ID` or create one, bind it to logs and echo it back."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope["headers"]).get(REQUEST_ID_HEADER, b"").decode("latin-1")
        request_id = incoming if _VALID_REQUEST_ID.match(incoming) else uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [
                    *(h for h in message.get("headers", []) if h[0].lower() != REQUEST_ID_HEADER),
                    (REQUEST_ID_HEADER, request_id.encode()),
                ]
            await send(message)

        await self.app(scope, receive, send_with_id)


class AccessLogMiddleware:
    """One line per request: method, route template, status and duration. Never the query string,
    headers or bodies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = _SERVER_ERROR

        async def capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, capture)
        finally:
            route = getattr(scope.get("route"), "path", None) or "unmatched"
            log = structlog.get_logger()
            emit = log.error if status >= _SERVER_ERROR else log.info
            emit(
                "http.request",
                method=scope["method"],
                route=route,
                status=status,
                duration_ms=round((time.perf_counter() - started) * 1000, 1),
            )


class _PayloadTooLargeError(Exception):
    pass


class BodySizeLimitMiddleware:
    """Reject bodies over the limit: by `Content-Length`, and by counting streamed chunks."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._reject(scope, receive, send)
            return

        received = 0
        response_started = False

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _PayloadTooLargeError
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            response_started = response_started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except _PayloadTooLargeError:
            if response_started:
                raise
            await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = problem_response(
            status=413, code="payload_too_large", message_key="errors.payloadTooLarge"
        )
        await response(scope, receive, send)
