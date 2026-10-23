"""Chat: messages, annotations, feedback and the SSE stream events (plan 7c).

Wire format of the streams: each SSE frame is `event: <name>` plus `data: <JSON of the matching
model below>`; the model repeats `event` so a client can parse `data` alone.
Raw model content blocks never leave the server: `display_text` is the guarded text.
"""

from __future__ import annotations

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from api.schemas.base import ApiModel, RequestModel
from api.schemas.common import FilterLink
from api.schemas.enums import (
    ClarificationQuestionId,
    FeedbackValue,
    MessageKind,
    MessageRole,
    MessageStatus,
    StopReason,
)
from api.schemas.runs import ClarificationAnswers


class _Span(ApiModel):
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    """Character offsets into `display_text` (Unicode code points, end exclusive)."""

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.end < self.start:
            raise ValueError("end must not precede start")
        return self


class FilterAnnotation(_Span):
    """A figure in the text that applies a filter when clicked."""

    type: Literal["filter"] = "filter"
    link: FilterLink


class ProductAnnotation(_Span):
    """A product mention that opens its detail."""

    type: Literal["product"] = "product"
    code: str


Annotation = Annotated[FilterAnnotation | ProductAnnotation, Field(discriminator="type")]


class TextPayload(ApiModel):
    kind: Literal[MessageKind.TEXT] = MessageKind.TEXT


class FilePayload(ApiModel):
    kind: Literal[MessageKind.FILE] = MessageKind.FILE
    file_name: str
    size_bytes: int


class MappingPayload(ApiModel):
    """The confirmation card; its data comes from `GET /conversations/{id}/plan`."""

    kind: Literal[MessageKind.MAPPING] = MessageKind.MAPPING
    confirmed: bool


class ClarificationOption(ApiModel):
    value: str
    label_key: str


class ClarificationQuestion(ApiModel):
    id: ClarificationQuestionId
    options: list[ClarificationOption]
    allows_other: bool


class ClarificationPayload(ApiModel):
    kind: Literal[MessageKind.CLARIFICATION] = MessageKind.CLARIFICATION
    questions: list[ClarificationQuestion] = Field(max_length=2)
    answers: ClarificationAnswers | None
    """Set once the user answered."""


class ProgressPayload(ApiModel):
    kind: Literal[MessageKind.PROGRESS] = MessageKind.PROGRESS
    job_id: UUID


class ResultPayload(ApiModel):
    kind: Literal[MessageKind.RESULT] = MessageKind.RESULT
    run_id: UUID


class ErrorPayload(ApiModel):
    kind: Literal[MessageKind.ERROR] = MessageKind.ERROR
    message_key: str
    ref: str


MessagePayload = Annotated[
    TextPayload
    | FilePayload
    | MappingPayload
    | ClarificationPayload
    | ProgressPayload
    | ResultPayload
    | ErrorPayload,
    Field(discriminator="kind"),
]


class ChatMessage(ApiModel):
    id: UUID
    conversation_id: UUID
    role: MessageRole
    status: MessageStatus
    display_text: str
    payload: MessagePayload = Field(default_factory=TextPayload)
    annotations: list[Annotation] = Field(default_factory=list)
    context_product_code: str | None = None
    """Set when the message was asked from a product's detail."""
    feedback: FeedbackValue | None = None
    created_at: AwareDatetime


class MessagePage(ApiModel):
    items: list[ChatMessage]
    next_cursor: str | None


class MessageCreate(RequestModel):
    text: str = Field(min_length=1, max_length=4000)
    context_product_code: str | None = Field(default=None, max_length=64)


class FeedbackCreate(RequestModel):
    """`null` clears a previous like or dislike."""

    value: FeedbackValue | None


class Feedback(ApiModel):
    message_id: UUID
    value: FeedbackValue | None


class MessageStartEvent(ApiModel):
    event: Literal["message.start"] = "message.start"
    message_id: UUID


class TextDeltaEvent(ApiModel):
    event: Literal["text.delta"] = "text.delta"
    message_id: UUID
    text: str


class ToolStartEvent(ApiModel):
    event: Literal["tool.start"] = "tool.start"
    tool_call_id: str
    status_key: str
    """i18n key of the human status line ("Revisando productos críticos…")."""


class ToolEndEvent(ApiModel):
    event: Literal["tool.end"] = "tool.end"
    tool_call_id: str


class AnnotationEvent(ApiModel):
    event: Literal["annotation"] = "annotation"
    message_id: UUID
    annotation: Annotation


class TokenUsage(ApiModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cache_read_tokens: int = Field(ge=0)


class MessageEndEvent(ApiModel):
    event: Literal["message.end"] = "message.end"
    message_id: UUID
    stop_reason: StopReason
    usage: TokenUsage


class StreamErrorEvent(ApiModel):
    event: Literal["error"] = "error"
    message_key: str
    ref: str


ChatStreamEvent = Annotated[
    MessageStartEvent
    | TextDeltaEvent
    | ToolStartEvent
    | ToolEndEvent
    | AnnotationEvent
    | MessageEndEvent
    | StreamErrorEvent,
    Field(discriminator="event"),
]
