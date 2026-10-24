"""Chat history (read side). Sending and retrying messages arrive with the assistant (B5)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import BusinessRuleError, NotFoundError
from api.schemas import ChatMessage, MessagePage
from api.schemas.chat import Annotation, MessagePayload
from api.services import cursors

_PAYLOAD = TypeAdapter(MessagePayload)
_ANNOTATIONS = TypeAdapter(list[Annotation])

_EXISTS = text("select 1 from public.conversations where id = :id and deleted_at is null")
_PAGE = text(
    "select m.id, m.seq, m.conversation_id, m.role, m.kind, m.display_text, m.payload, "
    "m.annotations, m.status, m.created_at, p.code as product_code, f.value as feedback "
    "from public.messages m "
    "left join public.products p on p.tenant_id = m.tenant_id and p.id = m.context_product_id "
    "left join public.message_feedback f on f.message_id = m.id and f.user_id = :user_id "
    "where m.conversation_id = :id and m.role <> 'system' "
    "and (cast(:before as bigint) is null or m.seq < :before) "
    "order by m.seq desc limit :limit"
)


def _message(row: Any) -> ChatMessage:
    return ChatMessage(
        id=row.id,
        conversation_id=row.conversation_id,
        role=row.role,
        status=row.status,
        display_text=row.display_text,
        payload=_PAYLOAD.validate_python({**(row.payload or {}), "kind": row.kind}),
        annotations=_ANNOTATIONS.validate_python(row.annotations or []),
        context_product_code=row.product_code,
        feedback=row.feedback,
        created_at=row.created_at,
    )


async def list_messages(
    session: AsyncSession,
    who: Principal,
    conversation_id: UUID,
    cursor: str | None,
    limit: int,
) -> MessagePage:
    """The latest `limit` messages, oldest first; `next_cursor` walks back to earlier ones."""
    if (await session.execute(_EXISTS, {"id": conversation_id})).first() is None:
        raise NotFoundError
    before: int | None = None
    if cursor:
        try:
            before = int(cursors.decode(cursor)["before"])
        except (KeyError, ValueError, TypeError) as error:
            raise BusinessRuleError("errors.invalidCursor") from error
    rows = (
        await session.execute(
            _PAGE,
            {"id": conversation_id, "user_id": who.user_id, "before": before, "limit": limit + 1},
        )
    ).all()
    page, more = rows[:limit], len(rows) > limit
    try:
        items = [_message(r) for r in reversed(page)]
    except ValidationError as error:  # stored data the contract cannot express
        raise NotFoundError from error
    next_cursor = cursors.encode({"before": page[-1].seq}) if more else None
    return MessagePage(items=items, next_cursor=next_cursor)
