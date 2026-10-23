"""Until B4 every endpoint answers 501 with problem details (not a crash, not a fake success)."""

import pytest
from fastapi.testclient import TestClient

from api.main import create_app

from .endpoints import ID, STUBS, concrete


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


@pytest.mark.parametrize(
    ("method", "path", "operation_id", "body"),
    [(m, p, o, b) for m, p, o, _, b in STUBS],
    ids=[e[2] for e in STUBS],
)
def test_stub_answers_501_problem_details(
    client: TestClient, method: str, path: str, operation_id: str, body: object
) -> None:
    response = client.request(method, concrete(path), json=body, headers={"X-Request-ID": "req-7"})

    assert response.status_code == 501, operation_id
    assert response.headers["content-type"].startswith("application/problem+json")
    problem = response.json()
    assert problem["status"] == 501
    assert problem["code"] == "not_implemented"
    assert problem["message_key"] == "errors.notImplemented"
    assert problem["request_id"] == "req-7"
    assert problem["ref"]


def test_invalid_body_is_422_problem_details_with_field_issues(client: TestClient) -> None:
    response = client.post(f"/v1/conversations/{ID}/messages", json={"unknown": 1})

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    problem = response.json()
    assert problem["code"] == "validation_error"
    assert problem["message_key"] == "errors.validation"
    assert problem["fields"]
    assert {"field", "code"} <= set(problem["fields"][0])


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
