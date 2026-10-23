"""structlog setup for the API: the shared configuration with this service's settings."""

from __future__ import annotations

from typing import TextIO

import telemetry

from api.settings import Settings

SERVICE = "api"


def configure_logging(settings: Settings, *, stream: TextIO | None = None) -> None:
    telemetry.configure_logging(
        service=SERVICE,
        environment=settings.environment,
        version=settings.service_version,
        as_json=settings.log_json,
        level=settings.log_level,
        stream=stream,
    )
