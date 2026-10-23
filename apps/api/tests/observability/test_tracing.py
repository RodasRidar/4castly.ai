"""The API wires the shared tracing to its settings and instruments the app."""

from fastapi import FastAPI

from api.observability.tracing import axiom_exporter_config, configure_tracing
from api.settings import Settings


def test_axiom_config_comes_from_settings() -> None:
    config = axiom_exporter_config(
        Settings(axiom_domain="api.eu.axiom.co", axiom_token="tok", axiom_dataset="4castly-dev")
    )

    assert config == {
        "endpoint": "https://api.eu.axiom.co/v1/traces",
        "headers": {"Authorization": "Bearer tok", "X-Axiom-Dataset": "4castly-dev"},
    }


def test_without_credentials_tracing_is_off() -> None:
    assert axiom_exporter_config(Settings()) is None
    assert configure_tracing(Settings(), FastAPI()) is None


def test_with_credentials_the_app_is_instrumented() -> None:
    app = FastAPI()
    settings = Settings(axiom_token="tok", axiom_dataset="4castly-dev", environment="dev")

    provider = configure_tracing(settings, app)

    try:
        assert provider is not None
        assert provider.resource.attributes["service.name"] == "api"
        assert getattr(app, "_is_instrumented_by_opentelemetry", False)
    finally:
        if provider is not None:
            provider.shutdown()
