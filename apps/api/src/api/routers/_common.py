"""Pieces shared by the v1 routers: auth scheme, documented errors, SSE and file responses."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Header, Response
from fastapi.security import HTTPBearer

from api.schemas import ApiError

bearer_scheme = HTTPBearer(
    scheme_name="SupabaseJWT",
    bearerFormat="JWT",
    description="Supabase access token. The tenant is resolved server-side from membership.",
    auto_error=False,  # B2b verifies the token and answers 401; the stubs do not
)

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_ERROR_DESCRIPTIONS = {
    401: "Missing or invalid token.",
    404: "Not found, also for another tenant's resource.",
    409: "The resource is not in a state that allows this operation.",
    422: "Invalid input; `fields` lists what failed.",
    429: "Rate limit reached.",
}


def errors(*extra: int) -> dict[int | str, dict[str, Any]]:
    """Problem-details responses every operation can return, plus the given statuses."""
    statuses = sorted({401, 429, *extra})
    return {
        status: {"model": ApiError, "description": _ERROR_DESCRIPTIONS[status]}
        for status in statuses
    }


class EventStreamResponse(Response):
    """`text/event-stream`: the typed event union is documented through `responses`."""

    media_type = "text/event-stream"


IdempotencyKey = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=128,
        description="Replay protection: the same key returns the first response.",
    ),
]
