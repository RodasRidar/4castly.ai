"""Structured logs: one JSON object per line with the standard fields, redacted, trace-linked."""

import io
import json

import structlog
from opentelemetry.sdk.trace import TracerProvider

from telemetry.logging import configure_logging


def lines(stream: io.StringIO) -> list[dict]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line]


def logger_for(
    *, environment: str = "prod", as_json: bool | None = True
) -> tuple[io.StringIO, structlog.stdlib.BoundLogger]:
    stream = io.StringIO()
    configure_logging(
        service="api", environment=environment, version="1.2.3", as_json=as_json, stream=stream
    )
    structlog.contextvars.clear_contextvars()
    return stream, structlog.get_logger()


def test_standard_fields_are_present_on_every_line() -> None:
    stream, log = logger_for()

    log.info("job.finished", job_id="j-1")

    [entry] = lines(stream)
    assert entry["event"] == "job.finished"
    assert entry["level"] == "info"
    assert entry["service"] == "api"
    assert entry["env"] == "prod"
    assert entry["version"] == "1.2.3"
    assert entry["job_id"] == "j-1"
    assert entry["timestamp"].endswith("Z")


def test_bound_context_fields_appear_on_every_line() -> None:
    stream, log = logger_for()
    structlog.contextvars.bind_contextvars(request_id="req-1", tenant_id="t-1", user_id="u-1")

    log.info("a")
    log.warning("b")

    assert [(e["request_id"], e["tenant_id"], e["user_id"]) for e in lines(stream)] == [
        ("req-1", "t-1", "u-1")
    ] * 2


def test_trace_and_span_ids_link_a_line_to_its_trace() -> None:
    stream, log = logger_for()
    tracer = TracerProvider().get_tracer("test")

    with tracer.start_as_current_span("work") as span:
        log.info("inside")
        context = span.get_span_context()
    log.info("outside")

    inside, outside = lines(stream)
    assert inside["trace_id"] == format(context.trace_id, "032x")
    assert inside["span_id"] == format(context.span_id, "016x")
    assert "trace_id" not in outside


def test_client_data_is_redacted_before_it_is_written() -> None:
    stream, log = logger_for()

    log.info("upload.parsed", file_content="a,b\n1,2", user="ana@example.com", rows=2)

    [entry] = lines(stream)
    assert entry["file_content"] == "[redacted]"
    assert entry["user"] == "[email]"
    assert entry["rows"] == 2


def test_exceptions_are_rendered_as_text_inside_the_json_line() -> None:
    stream, log = logger_for()

    try:
        raise ValueError("boom")
    except ValueError:
        log.exception("job.failed")

    [entry] = lines(stream)
    assert "ValueError" in entry["exception"]
    assert entry["level"] == "error"


def test_debug_is_off_in_production_and_on_locally() -> None:
    prod_stream, prod_log = logger_for()
    prod_log.debug("noisy")
    local_stream, local_log = logger_for(environment="local", as_json=True)
    local_log.debug("noisy")

    assert lines(prod_stream) == []
    assert len(lines(local_stream)) == 1


def test_local_default_is_a_console_renderer_not_json() -> None:
    stream, log = logger_for(environment="local", as_json=None)

    log.info("hello")

    assert "hello" in stream.getvalue()
    assert not stream.getvalue().lstrip().startswith("{")
