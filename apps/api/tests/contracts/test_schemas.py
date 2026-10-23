"""Validation rules carried by the contract schemas (plan sections 7 and 11 S13)."""

from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from api.schemas import (
    ApiError,
    ChatMessage,
    ChatStreamEvent,
    ClarificationAnswers,
    ConversationUpdate,
    ExportRequest,
    FilePayload,
    ForecastRequest,
    Preferences,
    ProfileUpdate,
    RunParameters,
    UploadCreate,
)

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
XLS = "application/vnd.ms-excel"
XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12"


class TestUploadCreate:
    @pytest.mark.parametrize(
        ("name", "content_type"),
        [("kardex.xlsx", XLSX), ("old.XLS", XLS), ("ventas.csv", "text/csv")],
    )
    def test_accepts_supported_spreadsheet_types(self, name: str, content_type: str) -> None:
        upload = UploadCreate(file_name=name, size_bytes=10, content_type=content_type)

        assert upload.file_name == name

    @pytest.mark.parametrize(
        ("name", "content_type"),
        [
            ("macro.xlsm", XLSM),  # macro formats are rejected (S11)
            ("kardex.xlsx", "application/pdf"),
            ("kardex.pdf", XLSX),
            ("", XLSX),
        ],
    )
    def test_rejects_unsupported_files(self, name: str, content_type: str) -> None:
        with pytest.raises(ValidationError):
            UploadCreate(file_name=name, size_bytes=10, content_type=content_type)

    def test_rejects_empty_files_and_unknown_fields(self) -> None:
        with pytest.raises(ValidationError):
            UploadCreate(file_name="a.csv", size_bytes=0, content_type="text/csv")
        with pytest.raises(ValidationError):
            UploadCreate.model_validate(
                {"file_name": "a.csv", "size_bytes": 1, "content_type": "text/csv", "x": 1}
            )


class TestProfileAndPreferences:
    def test_profile_update_needs_at_least_one_field(self) -> None:
        with pytest.raises(ValidationError):
            ProfileUpdate()
        assert ProfileUpdate(job_title=None).job_title is None

    def test_profile_update_forbids_unknown_fields(self) -> None:
        with pytest.raises(ValidationError):
            ProfileUpdate.model_validate({"full_name": "Ana", "email": "x@y.z"})

    def test_preferences_accept_an_iana_time_zone_only(self) -> None:
        ok = Preferences(
            theme="system", locale="es", time_zone="America/Lima", assistant_style="brief"
        )

        assert ok.time_zone == "America/Lima"
        with pytest.raises(ValidationError):
            Preferences(theme="system", locale="es", time_zone="Mars/Base", assistant_style="brief")

    def test_preferences_reject_unknown_enum_values(self) -> None:
        with pytest.raises(ValidationError):
            Preferences(
                theme="sepia", locale="es", time_zone="America/Lima", assistant_style="brief"
            )


class TestConversationUpdate:
    def test_needs_at_least_one_field(self) -> None:
        with pytest.raises(ValidationError):
            ConversationUpdate()
        assert ConversationUpdate(pinned=False).pinned is False

    def test_rejects_blank_titles(self) -> None:
        with pytest.raises(ValidationError):
            ConversationUpdate(title="")


class TestForecastRequest:
    def test_accepts_answers_or_skip(self) -> None:
        answers = ClarificationAnswers(lead_time_days=14, had_stockouts="no")

        assert ForecastRequest(answers=answers).skip is False
        assert ForecastRequest(skip=True).answers is None

    @pytest.mark.parametrize(
        "payload",
        [
            {},
            {"skip": False},
            {"skip": True, "answers": {"lead_time_days": 7}},
            {"answers": {}},
        ],
    )
    def test_rejects_ambiguous_requests(self, payload: dict) -> None:
        with pytest.raises(ValidationError):
            ForecastRequest.model_validate(payload)

    def test_lead_time_must_be_positive(self) -> None:
        with pytest.raises(ValidationError):
            ClarificationAnswers(lead_time_days=0)


class TestExportRequest:
    def test_all_scope_takes_no_codes(self) -> None:
        assert ExportRequest(scope="all").codes is None
        with pytest.raises(ValidationError):
            ExportRequest(scope="all", codes=["A"])

    def test_selection_needs_codes(self) -> None:
        assert ExportRequest(scope="selection", codes=["A", "B"]).codes == ["A", "B"]
        with pytest.raises(ValidationError):
            ExportRequest(scope="selection")

    def test_product_scope_needs_exactly_one_code(self) -> None:
        assert ExportRequest(scope="product", codes=["A"]).format == "xlsx"
        with pytest.raises(ValidationError):
            ExportRequest(scope="product", codes=["A", "B"])


class TestRunParameters:
    def base(self, **overrides: object) -> dict:
        return {
            "horizon_weeks": 12,
            "granularity": "weekly",
            "lead_time_days": 14,
            "target_coverage_weeks": 4,
            "risk_thresholds": {"critical_margin_weeks": 0, "medium_margin_weeks": 2},
            "assistant_style": "brief",
        } | overrides

    def test_accepts_offered_horizons_only(self) -> None:
        assert RunParameters.model_validate(self.base()).horizon_weeks == 12
        with pytest.raises(ValidationError):
            RunParameters.model_validate(self.base(horizon_weeks=10))

    def test_critical_margin_cannot_exceed_medium_margin(self) -> None:
        with pytest.raises(ValidationError):
            RunParameters.model_validate(
                self.base(risk_thresholds={"critical_margin_weeks": 3, "medium_margin_weeks": 2})
            )


class TestChat:
    def test_message_payload_is_discriminated_by_kind(self) -> None:
        message = ChatMessage.model_validate(
            {
                "id": str(uuid4()),
                "conversation_id": str(uuid4()),
                "role": "user",
                "status": "complete",
                "display_text": "",
                "payload": {"kind": "file", "file_name": "k.xlsx", "size_bytes": 10},
                "annotations": [],
                "context_product_code": None,
                "feedback": None,
                "created_at": "2026-10-23T09:30:00-05:00",
            }
        )

        assert isinstance(message.payload, FilePayload)

    def test_annotations_are_discriminated_by_type(self) -> None:
        message = ChatMessage.model_validate(
            {
                "id": str(uuid4()),
                "conversation_id": str(uuid4()),
                "role": "assistant",
                "status": "complete",
                "display_text": "Hay 12 productos críticos.",
                "payload": {"kind": "text"},
                "annotations": [
                    {
                        "type": "filter",
                        "start": 4,
                        "end": 6,
                        "link": {"risk": "critical", "count": 12},
                    },
                    {"type": "product", "start": 0, "end": 3, "code": "QF-0001"},
                ],
                "context_product_code": None,
                "feedback": None,
                "created_at": "2026-10-23T09:30:00-05:00",
            }
        )

        assert [a.type for a in message.annotations] == ["filter", "product"]

    def test_annotation_span_must_be_ordered(self) -> None:
        with pytest.raises(ValidationError):
            ChatMessage.model_validate(
                {
                    "id": str(uuid4()),
                    "conversation_id": str(uuid4()),
                    "role": "assistant",
                    "status": "complete",
                    "display_text": "x",
                    "payload": {"kind": "text"},
                    "annotations": [{"type": "product", "start": 5, "end": 2, "code": "A"}],
                    "created_at": "2026-10-23T09:30:00-05:00",
                }
            )

    @pytest.mark.parametrize(
        ("payload", "name"),
        [
            ({"event": "message.start", "message_id": str(uuid4())}, "MessageStartEvent"),
            ({"event": "text.delta", "message_id": str(uuid4()), "text": "ho"}, "TextDeltaEvent"),
            ({"event": "tool.start", "tool_call_id": "t1", "status_key": "k"}, "ToolStartEvent"),
            ({"event": "tool.end", "tool_call_id": "t1"}, "ToolEndEvent"),
            (
                {
                    "event": "message.end",
                    "message_id": str(uuid4()),
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 1, "output_tokens": 2, "cache_read_tokens": 0},
                },
                "MessageEndEvent",
            ),
            (
                {"event": "error", "message_key": "errors.generic", "ref": "A1B2"},
                "StreamErrorEvent",
            ),
        ],
    )
    def test_stream_events_are_discriminated_by_event(self, payload: dict, name: str) -> None:
        event = TypeAdapter(ChatStreamEvent).validate_python(payload)

        assert type(event).__name__ == name

    def test_unknown_stream_event_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            TypeAdapter(ChatStreamEvent).validate_python({"event": "nope"})


def test_api_error_matches_problem_details() -> None:
    error = ApiError(
        type="about:blank",
        title="Not Found",
        status=404,
        code="not_found",
        message_key="errors.notFound",
        ref="K7Q2",
        request_id="req-1",
    )

    assert error.model_dump()["message_key"] == "errors.notFound"
