"""Every operation in the contract is implemented: without a token each one answers 401 as problem
details (never a stub, never a crash)."""

import pytest
from fastapi.testclient import TestClient

from api.main import create_app

from .endpoints import ENDPOINTS, concrete


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


@pytest.mark.parametrize(
    ("method", "path", "operation_id", "body"),
    [(m, p, o, b) for m, p, o, _, b in ENDPOINTS],
    ids=[e[2] for e in ENDPOINTS],
)
def test_every_operation_requires_a_token(
    client: TestClient, method: str, path: str, operation_id: str, body: object
) -> None:
    response = client.request(method, concrete(path), json=body)

    assert response.status_code == 401, operation_id
    assert response.json()["code"] == "unauthenticated"


def test_unknown_route_is_404_problem_details(client: TestClient) -> None:
    response = client.get("/v1/nope")

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert response.headers["content-type"].startswith("application/problem+json")


def test_wrong_method_is_405_problem_details(client: TestClient) -> None:
    response = client.delete("/v1/me")

    assert response.status_code == 405
    assert response.json()["message_key"] == "errors.methodNotAllowed"


def test_health_is_untouched(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
