"""Tracing for the assistant's LLM calls (plan 7c).

Langfuse receives the spans with prompts and completions over OTLP. Axiom receives the same spans
through the attribute filter that drops them (S9). Without either, assistant spans go nowhere.
"""

from __future__ import annotations

import base64
from typing import TypedDict

from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter
from telemetry import axiom_exporter_config
from telemetry.tracing import AttributeFilteringExporter

from api.observability.logging import SERVICE
from api.settings import Settings

EXPORT_TIMEOUT_SECONDS = 5
QUEUE_SIZE = 512


class LangfuseConfig(TypedDict):
    endpoint: str
    headers: dict[str, str]


def langfuse_exporter_config(settings: Settings) -> LangfuseConfig | None:
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        return None
    token = base64.b64encode(
        f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
    ).decode()
    return {
        "endpoint": f"{settings.langfuse_host.rstrip('/')}/api/public/otel/v1/traces",
        "headers": {"Authorization": f"Basic {token}"},
    }


def llm_exporters(settings: Settings) -> list[SpanExporter]:
    exporters: list[SpanExporter] = []
    if (langfuse := langfuse_exporter_config(settings)) is not None:
        exporters.append(
            OTLPSpanExporter(
                endpoint=langfuse["endpoint"],
                headers=langfuse["headers"],
                timeout=EXPORT_TIMEOUT_SECONDS,
            )
        )
    if (
        axiom := axiom_exporter_config(
            settings.axiom_domain, settings.axiom_token, settings.axiom_dataset
        )
    ) is not None:
        exporters.append(
            AttributeFilteringExporter(
                OTLPSpanExporter(
                    endpoint=axiom["endpoint"],
                    headers=axiom["headers"],
                    timeout=EXPORT_TIMEOUT_SECONDS,
                )
            )
        )
    return exporters


def build_llm_tracer_provider(settings: Settings) -> TracerProvider | None:
    exporters = llm_exporters(settings)
    if not exporters:
        return None
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": SERVICE,
                "service.version": settings.service_version,
                "deployment.environment": settings.environment,
            }
        )
    )
    for exporter in exporters:
        provider.add_span_processor(
            BatchSpanProcessor(
                exporter,
                max_queue_size=QUEUE_SIZE,
                export_timeout_millis=EXPORT_TIMEOUT_SECONDS * 1000,
            )
        )
    return provider
