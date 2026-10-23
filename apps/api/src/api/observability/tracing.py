"""Tracing for the API: Axiom export (shared, prompt-stripping) plus FastAPI and httpx spans."""

from __future__ import annotations

from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from telemetry import axiom_exporter_config as _axiom_config
from telemetry import build_tracer_provider
from telemetry.tracing import AxiomConfig

from api.observability.logging import SERVICE
from api.settings import Settings

_EXCLUDED_URLS = "health,health/live,health/ready"


def axiom_exporter_config(settings: Settings) -> AxiomConfig | None:
    return _axiom_config(settings.axiom_domain, settings.axiom_token, settings.axiom_dataset)


def configure_tracing(settings: Settings, app: FastAPI) -> TracerProvider | None:
    provider = build_tracer_provider(
        service=SERVICE,
        version=settings.service_version,
        environment=settings.environment,
        config=axiom_exporter_config(settings),
    )
    if provider is None:
        return None
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider, excluded_urls=_EXCLUDED_URLS)
    HTTPXClientInstrumentor().instrument(tracer_provider=provider)
    return provider
