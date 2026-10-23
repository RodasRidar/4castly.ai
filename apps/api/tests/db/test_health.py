"""Liveness and readiness (R9): a live process is not the same as a reachable database."""

from __future__ import annotations

import socket

from fastapi.testclient import TestClient

from api.main import create_app
from api.settings import Settings

PROBLEM = "application/problem+json"


def client_for(database_url: str = "") -> TestClient:
    return TestClient(create_app(Settings(database_url=database_url)))


def closed_port_url() -> str:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    return f"postgresql://app_api:test@127.0.0.1:{port}/castly"


def test_live_needs_no_database() -> None:
    with client_for() as client:
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_legacy_health_path_still_answers() -> None:
    with client_for() as client:
        assert client.get("/health").json() == {"status": "ok"}


def test_ready_without_a_database_configured_is_a_503_problem() -> None:
    with client_for() as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.headers["content-type"].startswith(PROBLEM)
    assert response.json()["code"] == "unavailable"


def test_ready_with_an_unreachable_database_is_a_503_problem() -> None:
    with client_for(closed_port_url()) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["message_key"] == "errors.unavailable"


def test_ready_with_a_reachable_database_is_ok(api_url: str) -> None:
    with client_for(api_url) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_does_not_leak_connection_details(api_url: str) -> None:
    bad = api_url.replace(":test@", ":wrong-secret@").replace("app_api", "no_such_role")
    with client_for(bad) as client:
        response = client.get("/health/ready")

    body = response.text
    assert response.status_code == 503
    assert "wrong-secret" not in body
    assert "no_such_role" not in body
