"""`/v1/messages`: actions on a single chat message."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from api.auth import CurrentTx
from api.domain.errors import NotImplementedYetError
from api.routers._common import EventStreamResponse, bearer_scheme, errors
from api.schemas import ChatStreamEvent, Feedback, FeedbackCreate
from api.services import chat

router = APIRouter(
    prefix="/v1/messages",
    tags=["messages"],
    dependencies=[Depends(bearer_scheme)],
    responses=errors(),
)


@router.post("/{message_id}/feedback", responses=errors(404, 422))
async def submit_feedback(message_id: UUID, body: FeedbackCreate) -> Feedback:
    """Like or dislike an assistant answer; `null` clears it."""
    raise NotImplementedYetError


@router.post(
    "/{message_id}/retry",
    response_class=EventStreamResponse,
    responses={
        200: {"model": ChatStreamEvent, "description": "A new answer, token by token."},
        **errors(404, 409, 422),
    },
)
async def retry_message(message_id: UUID, tx: CurrentTx) -> StreamingResponse:
    """Regenerate the answer to the previous question (appends; earlier turns never change)."""
    prepared = await chat.prepare_retry(tx, message_id)
    return StreamingResponse(
        chat.stream(tx, prepared),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
