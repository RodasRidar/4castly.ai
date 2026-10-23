"""`/v1/conversations`: sidebar, detail, plan confirmation, forecast start and chat."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from api.domain.errors import NotImplementedYetError
from api.routers._common import (
    EventStreamResponse,
    IdempotencyKey,
    bearer_scheme,
    errors,
)
from api.schemas import (
    ChatStreamEvent,
    Conversation,
    ConversationDetail,
    ConversationGroup,
    ConversationPage,
    ConversationUpdate,
    ForecastRequest,
    JobAccepted,
    MessageCreate,
    MessagePage,
    PlanConfirmation,
    PlanView,
)

router = APIRouter(
    prefix="/v1/conversations",
    tags=["conversations"],
    dependencies=[Depends(bearer_scheme)],
    responses=errors(),
)


@router.get("", responses=errors(422))
async def list_conversations(
    group: ConversationGroup | None = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    include_archived: bool = False,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ConversationPage:
    """Sidebar and history list, newest activity first. Soft-deleted ones are never listed."""
    raise NotImplementedYetError


@router.get("/{conversation_id}", responses=errors(404, 422))
async def get_conversation(conversation_id: UUID) -> ConversationDetail:
    """The conversation with its stage (drives the whole screen) and upload."""
    raise NotImplementedYetError


@router.patch("/{conversation_id}", responses=errors(404, 422))
async def update_conversation(conversation_id: UUID, body: ConversationUpdate) -> Conversation:
    """Rename, pin or archive."""
    raise NotImplementedYetError


@router.delete("/{conversation_id}", status_code=204, responses=errors(404, 422))
async def delete_conversation(conversation_id: UUID) -> Response:
    """Soft delete; `restore` undoes it for 30 days."""
    raise NotImplementedYetError


@router.post("/{conversation_id}/restore", responses=errors(404, 422))
async def restore_conversation(conversation_id: UUID) -> Conversation:
    raise NotImplementedYetError


@router.get("/{conversation_id}/plan", responses=errors(404, 422))
async def get_plan(conversation_id: UUID) -> PlanView:
    """Detected sheets, mapping, samples, warnings and plausible date columns."""
    raise NotImplementedYetError


@router.put("/{conversation_id}/plan", responses=errors(404, 409, 422))
async def confirm_plan(conversation_id: UUID, body: PlanConfirmation) -> PlanView:
    """Confirm the proposed mapping or replace it, in one call."""
    raise NotImplementedYetError


@router.post("/{conversation_id}/forecast", status_code=202, responses=errors(404, 409, 422))
async def start_forecast(
    conversation_id: UUID,
    body: ForecastRequest,
    idempotency_key: IdempotencyKey = None,
) -> JobAccepted:
    """Answers or `skip: true`, then the forecast job starts."""
    raise NotImplementedYetError


@router.get("/{conversation_id}/messages", responses=errors(404, 422))
async def list_messages(
    conversation_id: UUID,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MessagePage:
    """Chat history, oldest first within a page."""
    raise NotImplementedYetError


@router.post(
    "/{conversation_id}/messages",
    response_class=EventStreamResponse,
    responses={
        200: {"model": ChatStreamEvent, "description": "The assistant answer, token by token."},
        **errors(404, 422),
    },
)
async def send_message(conversation_id: UUID, body: MessageCreate) -> None:
    """Send a question; the reply streams as server-sent events."""
    raise NotImplementedYetError
