"""OpenAPI normalisation: one error shape and clean SSE schemas for the TypeScript generator."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from api.errors import PROBLEM_JSON

_ERROR_REF = {"$ref": "#/components/schemas/ApiError"}
_FASTAPI_VALIDATION_SCHEMAS = ("HTTPValidationError", "ValidationError")
_EVENT_STREAM = "text/event-stream"
_FIRST_ERROR_STATUS = 400
_CHAT_EVENT_UNION = "ChatStreamEvent"


def normalise(schema: dict[str, Any]) -> dict[str, Any]:
    """Make every >=400 response `application/problem+json` with the `ApiError` schema, drop
    FastAPI's default validation schemas and name the SSE union (the only `oneOf` event stream)."""
    components = schema.get("components", {}).get("schemas", {})
    for item in schema.get("paths", {}).values():
        for operation in item.values():
            if not isinstance(operation, dict):
                continue
            for status, response in operation.get("responses", {}).items():
                if status.isdigit() and int(status) >= _FIRST_ERROR_STATUS:
                    response["content"] = {PROBLEM_JSON: {"schema": _ERROR_REF}}
                _name_event_stream_schema(response, components)
    for name in _FASTAPI_VALIDATION_SCHEMAS:
        components.pop(name, None)
    return schema


def _name_event_stream_schema(response: dict[str, Any], components: dict[str, Any]) -> None:
    """Give the chat event union a component name and drop the `type: string` FastAPI adds."""
    stream = response.get("content", {}).get(_EVENT_STREAM)
    if not stream:
        return
    body = stream["schema"]
    body.pop("type", None)
    if "oneOf" in body:
        components[_CHAT_EVENT_UNION] = body
        stream["schema"] = {"$ref": f"#/components/schemas/{_CHAT_EVENT_UNION}"}


def install_openapi(app: FastAPI) -> None:
    """Replace `app.openapi` with a cached, normalised version."""
    generate = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is None:
            app.openapi_schema = normalise(generate())
        return app.openapi_schema

    app.openapi = openapi  # ty: ignore[invalid-assignment]
