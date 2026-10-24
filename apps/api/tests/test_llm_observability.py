"""Langfuse gets the LLM spans with prompts; Axiom gets the same spans without them (S9)."""

from __future__ import annotations

import base64
import json
from uuid import uuid4

import httpx
import pytest
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from telemetry.tracing import AttributeFilteringExporter

from api.adapters.langfuse_scores import LangfuseScores
from api.observability.llm_tracing import langfuse_exporter_config, llm_exporters
from api.settings import Settings


def keyed(**fields: str) -> Settings:
    return Settings(langfuse_public_key="pk-lf-1", langfuse_secret_key="sk-lf-1", **fields)  # ty: ignore[invalid-argument-type]


class TestExporters:
    def test_langfuse_is_otlp_over_http_with_basic_auth(self) -> None:
        config = langfuse_exporter_config(keyed(langfuse_host="https://cloud.langfuse.com"))

        token = base64.b64encode(b"pk-lf-1:sk-lf-1").decode()
        assert config == {
            "endpoint": "https://cloud.langfuse.com/api/public/otel/v1/traces",
            "headers": {"Authorization": f"Basic {token}"},
        }

    def test_the_host_may_be_self_hosted_with_a_trailing_slash(self) -> None:
        config = langfuse_exporter_config(keyed(langfuse_host="https://lf.example.com/"))

        assert config is not None
        assert config["endpoint"] == "https://lf.example.com/api/public/otel/v1/traces"

    def test_without_both_keys_langfuse_is_off(self) -> None:
        assert langfuse_exporter_config(Settings()) is None
        assert langfuse_exporter_config(Settings(langfuse_public_key="pk")) is None

    def test_langfuse_receives_prompts_and_axiom_does_not(self) -> None:
        settings = keyed(axiom_token="tok", axiom_dataset="d")

        exporters = llm_exporters(settings)

        kinds = [type(e).__name__ for e in exporters]
        assert kinds == ["OTLPSpanExporter", "AttributeFilteringExporter"]
        assert isinstance(exporters[0], OTLPSpanExporter)
        assert isinstance(exporters[1], AttributeFilteringExporter)

    def test_with_nothing_configured_there_are_no_exporters(self) -> None:
        assert llm_exporters(Settings()) == []


def scores(handler) -> LangfuseScores:
    return LangfuseScores(
        host="https://lf.example.com/",
        public_key="pk-lf-1",
        secret_key="sk-lf-1",
        transport=httpx.MockTransport(handler),
    )


class TestScores:
    async def test_a_vote_is_an_idempotent_categorical_score_on_the_trace(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={})

        message, user = uuid4(), uuid4()

        await scores(handler).score("a" * 32, message, user, "up")

        [request] = seen
        assert request.method == "POST"
        assert str(request.url) == "https://lf.example.com/api/public/scores"
        assert request.headers["authorization"].startswith("Basic ")
        assert json.loads(request.content) == {
            "id": f"feedback-{message}-{user}",
            "traceId": "a" * 32,
            "name": "user_feedback",
            "value": "up",
            "dataType": "CATEGORICAL",
        }

    async def test_clearing_deletes_the_same_score(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={})

        message, user = uuid4(), uuid4()

        await scores(handler).score("a" * 32, message, user, None)

        [request] = seen
        assert request.method == "DELETE"
        assert request.url.path == f"/api/public/scores/feedback-{message}-{user}"

    async def test_a_missing_score_on_delete_is_fine(self) -> None:
        await scores(lambda _r: httpx.Response(404)).score("a" * 32, uuid4(), uuid4(), None)

    async def test_server_errors_raise_so_the_caller_can_log_and_carry_on(self) -> None:
        with pytest.raises(httpx.HTTPError):
            await scores(lambda _r: httpx.Response(500)).score("a" * 32, uuid4(), uuid4(), "up")
