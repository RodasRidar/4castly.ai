"""Like or dislike an assistant answer; the vote also becomes a score on the turn's trace."""

from __future__ import annotations

from uuid import UUID

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal, Tx
from api.domain.errors import NotFoundError
from api.schemas import Feedback, FeedbackCreate
from api.services import audit

_MESSAGE = text(
    "select payload ->> 'trace_id' as trace_id from public.messages "
    "where id = :id and role = 'assistant'"
)
_UPSERT = text(
    "insert into public.message_feedback (tenant_id, message_id, user_id, value) "
    "values (:tenant_id, :message_id, :user_id, :value) "
    "on conflict (message_id, user_id) do update set value = excluded.value"
)
_DELETE = text(
    "delete from public.message_feedback where message_id = :message_id and user_id = :user_id"
)


async def _save(
    session: AsyncSession, who: Principal, message_id: UUID, body: FeedbackCreate
) -> str | None:
    row = (await session.execute(_MESSAGE, {"id": message_id})).one_or_none()
    if row is None:
        raise NotFoundError
    scope = {"message_id": message_id, "user_id": who.user_id}
    if body.value is None:
        await session.execute(_DELETE, scope)
    else:
        await session.execute(
            _UPSERT, {**scope, "tenant_id": who.tenant_id, "value": body.value.value}
        )
    await audit.log_event(
        session,
        who,
        "assistant.feedback",
        "message",
        message_id,
        metadata={"value": body.value.value if body.value else None},
    )
    return row.trace_id


async def submit_feedback(tx: Tx, message_id: UUID, body: FeedbackCreate) -> Feedback:
    trace_id = await tx.run(_save, message_id, body)
    if trace_id:
        try:
            await tx.container.scores.score(
                trace_id, message_id, tx.who.user_id, body.value.value if body.value else None
            )
        except Exception:
            structlog.get_logger().warning("assistant.score_failed", message_id=str(message_id))
    return Feedback(message_id=message_id, value=body.value)
