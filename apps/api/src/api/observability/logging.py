"""structlog setup: JSON in deployed environments, a console renderer locally."""

from __future__ import annotations

import logging
import sys
from typing import Any, TextIO

import structlog
from opentelemetry import trace

from api.observability.redaction import redact
from api.settings import Settings

SERVICE = "api"


def _static_fields(settings: Settings) -> structlog.typing.Processor:
    def add(_: Any, __: str, event: structlog.typing.EventDict) -> structlog.typing.EventDict:
        event["service"] = SERVICE
        event["env"] = settings.environment
        event["version"] = settings.service_version
        return event

    return add


def _trace_ids(_: Any, __: str, event: structlog.typing.EventDict) -> structlog.typing.EventDict:
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        event["trace_id"] = format(context.trace_id, "032x")
        event["span_id"] = format(context.span_id, "016x")
    return event


def _redact(_: Any, __: str, event: structlog.typing.EventDict) -> structlog.typing.EventDict:
    return redact(event)


def configure_logging(settings: Settings, *, stream: TextIO | None = None) -> None:
    as_json = (
        settings.log_json if settings.log_json is not None else settings.environment != "local"
    )
    default_level = logging.DEBUG if settings.environment == "local" else logging.INFO
    level = logging.getLevelNamesMapping().get((settings.log_level or "").upper(), default_level)

    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer()
        if as_json
        else structlog.dev.ConsoleRenderer(colors=False)
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="timestamp"),
            _static_fields(settings),
            _trace_ids,
            structlog.processors.format_exc_info,
            _redact,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(file=stream or sys.stderr),
        cache_logger_on_first_use=False,
    )
