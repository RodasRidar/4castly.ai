"""Request id, access log and body-size limit (pure ASGI, plan 7b)."""

import io
import json

import pytest
import structlog
from fastapi.testclient import TestClient

from api.main import create_app
from api.observability.logging import configure_logging
from api.observability.middleware import BodySizeLimitMiddleware
from api.settings import Settings

SETTINGS = Settings(environment="prod", log_json=True, max_body_bytes=200)


@pytest.fixture
def stream() -> io.StringIO:
    out = io.StringIO()
    configure_logging(SETTINGS, stream=out)
    structlog.contextvars.clear_contextvars()
    return out


@pytest.fixture
def client(stream: io.StringIO) -> TestClient:
    app = create_app(SETTINGS)
    configure_logging(SETTINGS, stream=stream)  # create_app configures logging; capture it again
    return TestClient(app)


def access_lines(stream: io.StringIO) -> list[dict]:
    entries = [json.loads(line) for line in stream.getvalue().splitlines() if line]
    return [e for e in entries if e["event"] == "http.request"]


class TestRequestId:
    def test_a_valid_incoming_id_is_kept_and_echoed(self, client: TestClient) -> None:
        response = client.get("/health/live", headers={"X-Request-ID": "abc-123_DEF"})

        assert response.headers["X-Request-ID"] == "abc-123_DEF"

    @pytest.mark.parametrize("bad", ["x" * 65, "has space", "a;b", "../x", "a/b"])
    def test_an_unsafe_incoming_id_is_replaced(self, client: TestClient, bad: str) -> None:
        response = client.get("/health/live", headers={"X-Request-ID": bad})

        echoed = response.headers["X-Request-ID"]
        assert echoed != bad
        assert len(echoed) == 32

    def test_an_id_is_generated_when_missing_and_differs_per_request(
        self, client: TestClient
    ) -> None:
        first = client.get("/health/live").headers["X-Request-ID"]
        second = client.get("/health/live").headers["X-Request-ID"]

        assert first != second

    def test_the_id_is_available_to_problem_details(self, client: TestClient) -> None:
        response = client.get("/v1/me", headers={"X-Request-ID": "req-9"})

        assert response.json()["request_id"] == "req-9"


class TestAccessLog:
    def test_one_line_per_request_with_the_route_template(
        self, client: TestClient, stream: io.StringIO
    ) -> None:
        client.get(
            "/v1/jobs/00000000-0000-0000-0000-000000000001?secret=1",
            headers={"X-Request-ID": "req-5", "Authorization": "Bearer abc"},
        )

        [entry] = access_lines(stream)
        assert entry["method"] == "GET"
        assert entry["route"] == "/v1/jobs/{job_id}"
        assert entry["status"] == 401
        assert entry["request_id"] == "req-5"
        assert isinstance(entry["duration_ms"], float)

    def test_no_query_string_headers_or_bodies_are_logged(
        self, client: TestClient, stream: io.StringIO
    ) -> None:
        client.patch(
            "/v1/me?token=abc",
            json={"full_name": "Ana Torres"},
            headers={"Authorization": "Bearer abc.def.ghi"},
        )

        text = stream.getvalue()
        assert "abc.def.ghi" not in text
        assert "Ana Torres" not in text
        assert "token=abc" not in text

    def test_unmatched_paths_are_logged_without_the_concrete_path(
        self, client: TestClient, stream: io.StringIO
    ) -> None:
        client.get("/definitely/not/here/12345")

        [entry] = access_lines(stream)
        assert entry["status"] == 404
        assert entry["route"] == "unmatched"


class TestBodyLimit:
    def test_a_declared_oversized_body_is_a_413_problem(self, client: TestClient) -> None:
        response = client.put("/v1/me/preferences", content=b"x" * 500)

        assert response.status_code == 413
        assert response.headers["content-type"].startswith("application/problem+json")
        assert response.json()["code"] == "payload_too_large"

    def test_a_small_body_passes_through(self, client: TestClient) -> None:
        response = client.patch("/v1/me", json={"full_name": "Ana"})

        assert response.status_code == 401  # past the size limit, stopped by auth

    async def test_a_streamed_body_over_the_limit_is_cut_off(self) -> None:
        reached_app = False

        async def inner(scope, receive, send):
            nonlocal reached_app
            reached_app = True
            while (await receive()).get("more_body"):
                pass

        sent: list[dict] = []
        chunks = iter(
            [
                {"type": "http.request", "body": b"a" * 80, "more_body": True},
                {"type": "http.request", "body": b"b" * 80, "more_body": True},
                {"type": "http.request", "body": b"c" * 80, "more_body": False},
            ]
        )

        async def receive():
            return next(chunks)

        async def send(message):
            sent.append(message)

        app = BodySizeLimitMiddleware(inner, max_bytes=200)
        await app({"type": "http", "headers": [], "method": "POST", "path": "/x"}, receive, send)

        assert reached_app
        assert sent[0]["status"] == 413
