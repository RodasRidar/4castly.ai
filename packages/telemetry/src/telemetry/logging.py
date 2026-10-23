"""structlog setup: JSON in deployed environments, a console renderer locally."""

from __future__ import annotations

import logging
import sys
from typing import Any, TextIO

import structlog
from opentelemetry import trace

from telemetry.redaction import redact


def _static_fields(service: str, environment: str, version: str) -> structlog.typing.Processor:
    def add(_: Any, __: str, event: structlog.typing.EventDict) -> structlog.typing.EventDict:
        event["service"] = service
        event["env"] = environment
        event["version"] = version
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


def configure_logging(  # noqa: PLR0913 - keyword-only options of one configuration call
    *,
    service: str,
    environment: str,
    version: str,
    as_json: bool | None = None,
    level: str | None = None,
    stream: TextIO | None = None,
) -> None:
    """`as_json=None` means JSON everywhere except `local`; debug is on only locally."""
    use_json = environment != "local" if as_json is None else as_json
    default_level = logging.DEBUG if environment == "local" else logging.INFO
    resolved = logging.getLevelNamesMapping().get((level or "").upper(), default_level)

    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer()
        if use_json
        else structlog.dev.ConsoleRenderer(colors=False)
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="timestamp"),
            _static_fields(service, environment, version),
            _trace_ids,
            structlog.processors.format_exc_info,
            _redact,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(resolved),
        logger_factory=structlog.PrintLoggerFactory(file=stream or sys.stderr),
        cache_logger_on_first_use=False,
    )
