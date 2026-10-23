"""OpenTelemetry to Axiom over OTLP/HTTP, with prompts and completions stripped before export."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypedDict

from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    SpanExporter,
    SpanExportResult,
)

# Langfuse gets these through its own processor (B5); Axiom must never see them (S9).
_DROP_ATTRIBUTE_PREFIXES = (
    "gen_ai.prompt",
    "gen_ai.completion",
    "gen_ai.input",
    "gen_ai.output",
    "llm.prompts",
    "llm.completions",
)
_DROP_EVENT_PREFIX = "gen_ai.content"
QUEUE_SIZE = 512  # bounded: when Axiom is slow, spans are dropped, never queued without limit
EXPORT_TIMEOUT_SECONDS = 5


def _keep(key: str) -> bool:
    return not key.startswith(_DROP_ATTRIBUTE_PREFIXES)


class AttributeFilteringExporter(SpanExporter):
    """Span processors cannot edit finished spans, so the filter wraps the exporter instead."""

    def __init__(self, wrapped: SpanExporter) -> None:
        self.wrapped = wrapped

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        return self.wrapped.export([self._filtered(span) for span in spans])

    def shutdown(self) -> None:
        self.wrapped.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self.wrapped.force_flush(timeout_millis)

    @staticmethod
    def _filtered(span: ReadableSpan) -> ReadableSpan:
        events = [
            Event(
                event.name,
                {k: v for k, v in (event.attributes or {}).items() if _keep(k)},
                event.timestamp,
            )
            for event in span.events
            if not event.name.startswith(_DROP_EVENT_PREFIX)
        ]
        return ReadableSpan(
            name=span.name,
            context=span.context,
            parent=span.parent,
            resource=span.resource,
            attributes={k: v for k, v in (span.attributes or {}).items() if _keep(k)},
            events=events,
            links=span.links,
            kind=span.kind,
            status=span.status,
            start_time=span.start_time,
            end_time=span.end_time,
            instrumentation_scope=span.instrumentation_scope,
        )


class AxiomConfig(TypedDict):
    endpoint: str
    headers: dict[str, str]


def axiom_exporter_config(domain: str, token: str, dataset: str) -> AxiomConfig | None:
    """Endpoint and headers per the Axiom OpenTelemetry guide; `None` without credentials."""
    if not (token and dataset):
        return None
    return {
        "endpoint": f"https://{domain}/v1/traces",
        "headers": {"Authorization": f"Bearer {token}", "X-Axiom-Dataset": dataset},
    }


def build_tracer_provider(
    *, service: str, version: str, environment: str, config: AxiomConfig | None
) -> TracerProvider | None:
    """A provider that exports to Axiom through the attribute filter; `None` without credentials."""
    if config is None:
        return None
    exporter = AttributeFilteringExporter(
        OTLPSpanExporter(
            endpoint=config["endpoint"],
            headers=config["headers"],
            timeout=EXPORT_TIMEOUT_SECONDS,
        )
    )
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": service,
                "service.version": version,
                "deployment.environment": environment,
            }
        )
    )
    provider.add_span_processor(
        BatchSpanProcessor(
            exporter,
            max_queue_size=QUEUE_SIZE,
            export_timeout_millis=EXPORT_TIMEOUT_SECONDS * 1000,
        )
    )
    return provider
