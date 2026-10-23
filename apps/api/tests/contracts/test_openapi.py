"""The generated OpenAPI document is complete, uniform and committed (CI fails on drift)."""

import json
from pathlib import Path
from typing import Any

import pytest

from api.main import create_app

from .endpoints import ENDPOINTS, SSE_OPERATIONS

COMMITTED = Path(__file__).resolve().parents[2] / "openapi.json"
METHODS = {"get", "put", "post", "delete", "patch"}


@pytest.fixture(scope="module")
def spec() -> dict[str, Any]:
    return create_app().openapi()


def operations(spec: dict[str, Any]) -> dict[str, tuple[str, str, dict[str, Any]]]:
    return {
        op["operationId"]: (method, path, op)
        for path, item in spec["paths"].items()
        if path.startswith("/v1")
        for method, op in item.items()
        if method in METHODS
    }


def test_every_planned_endpoint_exists_with_its_operation_id_and_status(spec: dict) -> None:
    found = operations(spec)

    for method, path, operation_id, status, _ in ENDPOINTS:
        assert operation_id in found, operation_id
        assert found[operation_id][:2] == (method, path)
        assert str(status) in found[operation_id][2]["responses"], operation_id


def test_there_are_no_unplanned_v1_endpoints(spec: dict) -> None:
    assert set(operations(spec)) == {e[2] for e in ENDPOINTS}


def test_health_stays_outside_the_versioned_contract(spec: dict) -> None:
    assert {"/health/live", "/health/ready"} <= set(spec["paths"])
    assert "/health" not in spec["paths"]  # legacy alias, hidden from the contract


def test_every_operation_requires_the_bearer_token(spec: dict) -> None:
    for operation_id, (_, _, op) in operations(spec).items():
        assert {"SupabaseJWT": []} in op["security"], operation_id
    assert spec["components"]["securitySchemes"]["SupabaseJWT"]["scheme"] == "bearer"


def test_errors_are_problem_details_everywhere(spec: dict) -> None:
    schemas = spec["components"]["schemas"]
    assert "HTTPValidationError" not in schemas
    assert "ValidationError" not in schemas
    ref = {"$ref": "#/components/schemas/ApiError"}
    for operation_id, (_, _, op) in operations(spec).items():
        for status in ("401", "429"):
            assert status in op["responses"], (operation_id, status)
        for status, response in op["responses"].items():
            if int(status) >= 400:
                assert list(response["content"]) == ["application/problem+json"], operation_id
                assert response["content"]["application/problem+json"]["schema"] == ref


def test_requests_with_inputs_declare_422(spec: dict) -> None:
    for operation_id, (_, _, op) in operations(spec).items():
        has_input = bool(op.get("parameters")) or "requestBody" in op
        if has_input:
            assert "422" in op["responses"], operation_id


def test_routes_with_ids_declare_404(spec: dict) -> None:
    for operation_id, (_, path, op) in operations(spec).items():
        if "{" in path:
            assert "404" in op["responses"], operation_id


def test_stage_changing_posts_declare_409(spec: dict) -> None:
    found = operations(spec)
    for operation_id in ("complete_upload", "start_forecast", "confirm_plan", "cancel_job"):
        assert "409" in found[operation_id][2]["responses"], operation_id


def test_sse_operations_are_typed_event_streams(spec: dict) -> None:
    found = operations(spec)
    expected = {
        "stream_job_events": "JobUpdateEvent",
        "send_message": "ChatStreamEvent",
        "retry_message": "ChatStreamEvent",
    }
    for operation_id in SSE_OPERATIONS:
        content = found[operation_id][2]["responses"]["200"]["content"]
        assert list(content) == ["text/event-stream"], operation_id
        assert content["text/event-stream"]["schema"] == {
            "$ref": f"#/components/schemas/{expected[operation_id]}"
        }, operation_id


def test_chat_stream_event_is_a_named_union_of_every_event(spec: dict) -> None:
    union = spec["components"]["schemas"]["ChatStreamEvent"]

    assert [ref["$ref"].rsplit("/", 1)[1] for ref in union["oneOf"]] == [
        "MessageStartEvent",
        "TextDeltaEvent",
        "ToolStartEvent",
        "ToolEndEvent",
        "AnnotationEvent",
        "MessageEndEvent",
        "StreamErrorEvent",
    ]
    assert union["discriminator"]["propertyName"] == "event"
    assert "type" not in union


def test_template_download_is_a_binary_xlsx(spec: dict) -> None:
    content = operations(spec)["download_sales_template"][2]["responses"]["200"]["content"]

    xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert content[xlsx]["schema"] == {"type": "string", "format": "binary"}


def test_idempotency_key_header_is_declared_where_the_plan_requires_it(spec: dict) -> None:
    found = operations(spec)
    for operation_id in ("complete_upload", "start_forecast"):
        headers = [p for p in found[operation_id][2]["parameters"] if p["in"] == "header"]
        assert [h["name"] for h in headers] == ["Idempotency-Key"], operation_id
        assert headers[0]["required"] is False


def test_product_table_filters_use_allowlists_and_page_caps(spec: dict) -> None:
    params = {p["name"]: p for p in operations(spec)["list_run_products"][2]["parameters"]}

    assert set(params) == {"run_id", "q", "risk", "abc", "sort", "order", "page", "page_size"}
    assert params["risk"]["schema"]["anyOf"][0]["type"] == "array"
    assert params["page_size"]["schema"]["maximum"] == 100
    assert params["q"]["schema"]["anyOf"][0]["maxLength"] == 120
    sort = json.dumps(params["sort"]["schema"])
    assert "ProductSort" in sort


def test_single_schema_per_model_not_input_output_pairs(spec: dict) -> None:
    assert not [
        name for name in spec["components"]["schemas"] if name.endswith(("-Input", "-Output"))
    ]


@pytest.mark.parametrize(
    "name",
    [
        "User", "Preferences", "Conversation", "ConversationDetail", "ConversationStage",
        "ConversationGroup", "Upload", "FileProfile", "NormalizationPlan", "ColumnMapping",
        "DataWarning", "Job", "JobStage", "ClarificationAnswers", "ForecastRun", "RunParameters",
        "RunSummary", "RiskLevel", "AbcClass", "ProductRow", "ProductDetail",
        "WeeklyProjectionRow", "SeriesPoint", "Reliability", "ChatMessage", "FilterLink",
        "ExportRequest", "ApiError", "ChatStreamEvent", "JobUpdateEvent",
    ],
)  # fmt: skip
def test_models_the_frontend_names_are_in_the_contract(spec: dict, name: str) -> None:
    assert name in spec["components"]["schemas"]


@pytest.mark.skipif(not COMMITTED.exists(), reason="openapi.json not generated yet")
def test_committed_openapi_matches_the_application(spec: dict) -> None:
    """Fails on contract drift: run `make contracts` and commit the result."""
    assert json.loads(COMMITTED.read_text(encoding="utf-8")) == spec
