"""Traces go to Axiom without prompts or completions; without credentials tracing is simply off."""

from fastapi import FastAPI
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from api.observability.tracing import (
    AttributeFilteringExporter,
    axiom_exporter_config,
    configure_tracing,
)
from api.settings import Settings


def exported_span(attributes: dict[str, str | int], event: str | None = None):
    memory = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(AttributeFilteringExporter(memory)))
    with provider.get_tracer("t").start_as_current_span("llm", attributes=attributes) as span:
        if event:
            span.add_event(event, {"gen_ai.prompt": "secret", "kept": "yes"})
    [finished] = memory.get_finished_spans()
    return finished


def test_prompt_and_completion_attributes_are_dropped_before_export() -> None:
    span = exported_span(
        {
            "gen_ai.prompt.0.content": "sales of QF-0001",
            "gen_ai.completion.0.content": "answer",
            "gen_ai.request.model": "claude-sonnet-5-5",
            "gen_ai.usage.input_tokens": 12,
            "http.method": "POST",
        }
    )

    assert dict(span.attributes or {}) == {
        "gen_ai.request.model": "claude-sonnet-5-5",
        "gen_ai.usage.input_tokens": 12,
        "http.method": "POST",
    }


def test_content_events_are_dropped_and_other_events_lose_prompt_attributes() -> None:
    dropped = exported_span({"a": 1}, event="gen_ai.content.prompt")
    kept = exported_span({"a": 1}, event="job.stage")

    assert dropped.events == ()
    assert [dict(e.attributes or {}) for e in kept.events] == [{"kept": "yes"}]


def test_other_span_identity_survives_filtering() -> None:
    span = exported_span({"x": 1})

    assert span.name == "llm"
    assert span.context.trace_id != 0
    assert span.end_time is not None


def test_axiom_endpoint_and_headers_follow_the_documented_otlp_http_shape() -> None:
    config = axiom_exporter_config(
        Settings(axiom_domain="api.eu.axiom.co", axiom_token="tok", axiom_dataset="4castly-dev")
    )

    assert config == {
        "endpoint": "https://api.eu.axiom.co/v1/traces",
        "headers": {"Authorization": "Bearer tok", "X-Axiom-Dataset": "4castly-dev"},
    }


def test_without_credentials_there_is_no_exporter() -> None:
    assert axiom_exporter_config(Settings()) is None
    assert configure_tracing(Settings(), FastAPI()) is None


def test_with_credentials_a_provider_is_returned_and_the_app_instrumented() -> None:
    app = FastAPI()
    settings = Settings(axiom_token="tok", axiom_dataset="4castly-dev", environment="dev")

    provider = configure_tracing(settings, app)

    try:
        assert provider is not None
        assert provider.resource.attributes["service.name"] == "api"
        assert provider.resource.attributes["deployment.environment"] == "dev"
        assert getattr(app, "_is_instrumented_by_opentelemetry", False)
    finally:
        if provider is not None:
            provider.shutdown()
