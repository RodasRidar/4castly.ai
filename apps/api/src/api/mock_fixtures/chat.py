"""Chat fixtures: a finished conversation and a streamed answer, figures by reference."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from api.mock_fixtures._constants import NOW, READY_CONVERSATION, RUN_KEY, SUPPORT_REF, uid
from api.mock_fixtures.flow import clarification_answered
from api.mock_fixtures.run import Built
from api.schemas import (
    AnnotationEvent,
    ChatMessage,
    ErrorPayload,
    FeedbackValue,
    FilePayload,
    FilterAnnotation,
    FilterLink,
    MappingPayload,
    MessageEndEvent,
    MessageRole,
    MessageStartEvent,
    MessageStatus,
    ProductAnnotation,
    ProgressPayload,
    ResultPayload,
    RiskLevel,
    TextDeltaEvent,
    TextPayload,
    TokenUsage,
    ToolEndEvent,
    ToolStartEvent,
)
from api.schemas.enums import StopReason

FIRST_MESSAGE_MINUTES_AGO = 50


def _critical(items: list[Built]) -> list[Built]:
    critical = [i for i in items if i.analysis.risk is inv_critical()]
    return sorted(critical, key=lambda i: i.analysis.coverage.expected or 0.0)


def inv_critical() -> object:
    from inventory import RiskLevel as InventoryRisk  # noqa: PLC0415 - keeps the import local

    return InventoryRisk.CRITICAL


def _answer(items: list[Built]) -> tuple[str, int, list[Built]]:
    critical = _critical(items)
    first, second = critical[0], critical[1]
    text = (
        f"{len(critical)} productos críticos. "
        f"Empieza por {first.raw['name']} y {second.raw['name']}."
    )
    return text, len(critical), [first, second]


def _answer_annotations(
    text: str, count: int, products: list[Built]
) -> list[FilterAnnotation | ProductAnnotation]:
    phrase = f"{count} productos críticos"
    start = text.index(phrase)
    annotations: list[FilterAnnotation | ProductAnnotation] = [
        FilterAnnotation(
            start=start,
            end=start + len(phrase),
            link=FilterLink(risk=RiskLevel.CRITICAL, count=count),
        )
    ]
    for product in products:
        name = product.raw["name"]
        at = text.index(name)
        annotations.append(ProductAnnotation(start=at, end=at + len(name), code=product.code))
    return annotations


def _message(
    key: str,
    role: MessageRole,
    minutes_ago: int,
    *,
    text: str = "",
    payload: object | None = None,
    annotations: list[FilterAnnotation | ProductAnnotation] | None = None,
    status: MessageStatus = MessageStatus.COMPLETE,
    feedback: FeedbackValue | None = None,
) -> ChatMessage:
    return ChatMessage(
        id=uid(f"msg-{key}"),
        conversation_id=uid(READY_CONVERSATION),
        role=role,
        status=status,
        display_text=text,
        payload=payload or TextPayload(),  # ty: ignore[invalid-argument-type]
        annotations=annotations or [],
        created_at=NOW - timedelta(minutes=minutes_ago),
        feedback=feedback,
    )


def messages(items: list[Built]) -> list[ChatMessage]:
    text, count, products = _answer(items)
    user, assistant = MessageRole.USER, MessageRole.ASSISTANT
    start = FIRST_MESSAGE_MINUTES_AGO
    return [
        _message(
            "file",
            user,
            start,
            payload=FilePayload(file_name="kardex_oct.xlsx", size_bytes=482_113),
        ),
        _message(
            "digest",
            assistant,
            start - 1,
            text="Estoy leyendo tu archivo.",
            payload=ProgressPayload(job_id=uid("job-digest-ok")),
        ),
        _message(
            "mapping",
            assistant,
            start - 4,
            text="Así entendí tu archivo.",
            payload=MappingPayload(confirmed=True),
        ),
        _message(
            "clarify",
            assistant,
            start - 6,
            text="Dos preguntas rápidas.",
            payload=clarification_answered(),
        ),
        _message(
            "forecast",
            assistant,
            start - 8,
            text="Calculando el pronóstico.",
            payload=ProgressPayload(job_id=uid("job-forecast-ok")),
        ),
        _message(
            "result",
            assistant,
            start - 10,
            text="Tu pronóstico está listo.",
            payload=ResultPayload(run_id=uid(RUN_KEY)),
        ),
        _message("q1", user, 20, text="¿Qué debo comprar primero?"),
        _message(
            "a1",
            assistant,
            19,
            text=text,
            annotations=_answer_annotations(text, count, products),
            feedback=FeedbackValue.UP,
        ),
        _message("q2", user, 8, text="¿Y los de clase A?"),
        _message(
            "a2",
            assistant,
            7,
            text="Esa respuesta se cortó antes de terminar",
            status=MessageStatus.INTERRUPTED,
        ),
        _message(
            "err",
            assistant,
            3,
            payload=ErrorPayload(message_key="errors.assistant", ref=SUPPORT_REF),
            status=MessageStatus.ERROR,
        ),
    ]


def stream_example(items: list[Built]) -> tuple[list[object], str]:
    """Events of a streamed answer, and the final text they rebuild."""
    text, count, products = _answer(items)
    message_id: UUID = uid("msg-stream")
    deltas = text.replace(" ", " \u0000").split("\u0000")
    annotation = _answer_annotations(text, count, products)[0]
    events: list[object] = [
        MessageStartEvent(message_id=message_id),
        ToolStartEvent(tool_call_id="tool-1", status_key="assistant.tool.reviewingCritical"),
        ToolEndEvent(tool_call_id="tool-1"),
        *[TextDeltaEvent(message_id=message_id, text=piece) for piece in deltas],
        AnnotationEvent(message_id=message_id, annotation=annotation),
        MessageEndEvent(
            message_id=message_id,
            stop_reason=StopReason.END_TURN,
            usage=TokenUsage(input_tokens=1840, output_tokens=96, cache_read_tokens=1520),
        ),
    ]
    return events, text
