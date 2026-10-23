"""The planned endpoints (plan section 7 + additions listed in the B2a summary).

`(method, path, operation_id, success_status, sample_body)`; the body is a valid request so a stub
reaches its handler instead of failing validation.
"""

from typing import Any

ID = "00000000-0000-0000-0000-000000000001"

PREFERENCES = {
    "theme": "system",
    "locale": "es",
    "time_zone": "America/Lima",
    "assistant_style": "brief",
}
RUN_PARAMETERS = {
    "horizon_weeks": 12,
    "granularity": "weekly",
    "lead_time_days": 14,
    "target_coverage_weeks": 4,
    "risk_thresholds": {"critical_margin_weeks": 0, "medium_margin_weeks": 2},
    "assistant_style": "brief",
}

ENDPOINTS: list[tuple[str, str, str, int, Any]] = [
    ("get", "/v1/me", "get_me", 200, None),
    ("patch", "/v1/me", "update_me", 200, {"full_name": "Ana Torres"}),
    ("get", "/v1/me/preferences", "get_preferences", 200, None),
    ("put", "/v1/me/preferences", "update_preferences", 200, PREFERENCES),
    ("get", "/v1/conversations", "list_conversations", 200, None),
    ("get", "/v1/conversations/{conversation_id}", "get_conversation", 200, None),
    (
        "patch",
        "/v1/conversations/{conversation_id}",
        "update_conversation",
        200,
        {"pinned": True},
    ),
    ("delete", "/v1/conversations/{conversation_id}", "delete_conversation", 204, None),
    (
        "post",
        "/v1/conversations/{conversation_id}/restore",
        "restore_conversation",
        200,
        None,
    ),
    (
        "post",
        "/v1/uploads",
        "create_upload",
        201,
        {
            "file_name": "kardex.xlsx",
            "size_bytes": 1024,
            "content_type": "application/vnd.ms-excel",
        },
    ),
    ("post", "/v1/uploads/{upload_id}/complete", "complete_upload", 201, None),
    ("get", "/v1/templates/sales.xlsx", "download_sales_template", 200, None),
    ("get", "/v1/jobs/{job_id}", "get_job", 200, None),
    ("get", "/v1/jobs/{job_id}/events", "stream_job_events", 200, None),
    ("post", "/v1/jobs/{job_id}/cancel", "cancel_job", 200, None),
    ("get", "/v1/conversations/{conversation_id}/plan", "get_plan", 200, None),
    ("put", "/v1/conversations/{conversation_id}/plan", "confirm_plan", 200, {}),
    (
        "post",
        "/v1/conversations/{conversation_id}/forecast",
        "start_forecast",
        202,
        {"skip": True},
    ),
    ("get", "/v1/runs/{run_id}/summary", "get_run_summary", 200, None),
    ("get", "/v1/runs/{run_id}/products", "list_run_products", 200, None),
    ("get", "/v1/runs/{run_id}/products/{code}", "get_run_product", 200, None),
    (
        "post",
        "/v1/runs/{run_id}/products/{code}/simulate",
        "simulate_product",
        200,
        {"lead_time_days": 21},
    ),
    ("put", "/v1/runs/{run_id}/parameters", "update_run_parameters", 200, RUN_PARAMETERS),
    ("post", "/v1/runs/{run_id}/recalculate", "recalculate_run", 202, None),
    (
        "put",
        "/v1/products/{code}/overrides",
        "update_product_overrides",
        200,
        {"lead_time_days": 21},
    ),
    ("post", "/v1/runs/{run_id}/exports", "create_export", 201, {"scope": "all"}),
    ("get", "/v1/conversations/{conversation_id}/messages", "list_messages", 200, None),
    (
        "post",
        "/v1/conversations/{conversation_id}/messages",
        "send_message",
        200,
        {"text": "¿Qué debo comprar primero?"},
    ),
    ("post", "/v1/messages/{message_id}/feedback", "submit_feedback", 200, {"value": "up"}),
    ("post", "/v1/messages/{message_id}/retry", "retry_message", 200, None),
]

IMPLEMENTED = {
    "get_me",
    "update_me",
    "get_preferences",
    "update_preferences",
    "create_upload",
    "complete_upload",
    "download_sales_template",
    "get_job",
    "stream_job_events",
    "cancel_job",
    "list_conversations",
    "get_conversation",
    "update_conversation",
    "delete_conversation",
    "restore_conversation",
    "list_messages",
    "get_plan",
    "confirm_plan",
    "start_forecast",
    "get_run_summary",
}
"""Operations built in B4, tested on their own (`tests/db/endpoints`). B4 ends with only the chat
operations left as stubs until B5."""

STUBS = [e for e in ENDPOINTS if e[2] not in IMPLEMENTED]

SSE_OPERATIONS = {"stream_job_events", "send_message", "retry_message"}


def concrete(path: str) -> str:
    """Fill path parameters with sample values."""
    return (
        path.replace("{code}", "QF-0001")
        .replace("{conversation_id}", ID)
        .replace("{upload_id}", ID)
        .replace("{job_id}", ID)
        .replace("{run_id}", ID)
        .replace("{message_id}", ID)
    )
