"""Sidebar list, detail, rename/pin/archive and soft delete."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import BusinessRuleError, NotFoundError
from api.schemas import (
    Conversation,
    ConversationDetail,
    ConversationGroup,
    ConversationPage,
    ConversationUpdate,
    FileProfile,
    Upload,
)
from api.schemas.enums import ConversationStage, UploadErrorCode, UploadStatus
from api.services import audit, cursors

RESTORE_WINDOW_DAYS = 30
DEFAULT_TIME_ZONE = "America/Lima"

_COLUMNS = (
    "c.id, c.title, c.stage, c.pinned_at, c.archived_at, c.deleted_at, c.current_run_id, "
    "c.created_at, c.last_activity_at, "
    "(select u.file_name from public.uploads u where u.conversation_id = c.id "
    " order by u.created_at desc limit 1) as file_name, "
    "(select j.id from public.jobs j where j.conversation_id = c.id "
    " and j.status in ('queued', 'running') limit 1) as current_job_id"
)
_GROUP_SQL = {
    ConversationGroup.PINNED: "c.pinned_at is not null",
    ConversationGroup.TODAY: "c.pinned_at is null and c.last_activity_at >= :today",
    ConversationGroup.THIS_WEEK: (
        "c.pinned_at is null and c.last_activity_at < :today and c.last_activity_at >= :week"
    ),
    ConversationGroup.OLDER: "c.pinned_at is null and c.last_activity_at < :week",
}
_TIME_ZONE = text("select time_zone from public.profiles where user_id = :user_id")
_UPLOAD = text(
    "select id, file_name, size_bytes, content_type, status, error_code, sheets, selected_sheet, "
    "profile, created_at from public.uploads where conversation_id = :id "
    "order by created_at desc limit 1"
)
_LIKE_ESCAPES = str.maketrans({"\\": "\\\\", "%": "\\%", "_": "\\_"})


class _Clock:
    """Group boundaries in the user's own time zone."""

    def __init__(self, zone: str) -> None:
        try:
            tz = ZoneInfo(zone)
        except (KeyError, ValueError):
            tz = ZoneInfo(DEFAULT_TIME_ZONE)
        start = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        self.today = start
        self.week = start - timedelta(days=6)


async def _clock(session: AsyncSession, who: Principal) -> _Clock:
    zone = (await session.execute(_TIME_ZONE, {"user_id": who.user_id})).scalar_one_or_none()
    return _Clock(zone or DEFAULT_TIME_ZONE)


def _group(row: Any, clock: _Clock) -> ConversationGroup:
    if row.pinned_at is not None:
        return ConversationGroup.PINNED
    if row.last_activity_at >= clock.today:
        return ConversationGroup.TODAY
    if row.last_activity_at >= clock.week:
        return ConversationGroup.THIS_WEEK
    return ConversationGroup.OLDER


def _conversation(row: Any, clock: _Clock) -> Conversation:
    return Conversation(
        id=row.id,
        title=row.title,
        stage=ConversationStage(row.stage),
        group=_group(row, clock),
        pinned=row.pinned_at is not None,
        archived=row.archived_at is not None,
        file_name=row.file_name,
        current_job_id=row.current_job_id,
        current_run_id=row.current_run_id,
        created_at=row.created_at,
        last_activity_at=row.last_activity_at,
        deleted_at=row.deleted_at,
    )


async def list_conversations(  # noqa: PLR0913, PLR0917
    session: AsyncSession,
    who: Principal,
    group: ConversationGroup | None,
    q: str | None,
    include_archived: bool,
    cursor: str | None,
    limit: int,
) -> ConversationPage:
    clock = await _clock(session, who)
    where = ["c.deleted_at is null"]
    params: dict[str, Any] = {"limit": limit + 1}
    if not include_archived:
        where.append("c.archived_at is null")
    if q:
        where.append("c.title ilike :pattern escape '\\'")
        params["pattern"] = f"%{q.translate(_LIKE_ESCAPES)}%"
    if group is not None:
        where.append(_GROUP_SQL[group])
    if group in {ConversationGroup.TODAY, ConversationGroup.THIS_WEEK, ConversationGroup.OLDER}:
        params |= {"today": clock.today, "week": clock.week}
    if cursor:
        position = cursors.decode(cursor)
        try:
            params["after_at"] = datetime.fromisoformat(position["at"])
            params["after_id"] = UUID(position["id"])
        except (KeyError, ValueError, TypeError) as error:
            raise BusinessRuleError("errors.invalidCursor") from error
        where.append("(c.last_activity_at, c.id) < (:after_at, :after_id)")
    rows = (
        await session.execute(
            text(
                f"select {_COLUMNS} from public.conversations c where {' and '.join(where)} "  # noqa: S608
                "order by c.last_activity_at desc, c.id desc limit :limit"
            ),
            params,
        )
    ).all()
    page, more = rows[:limit], len(rows) > limit
    next_cursor = (
        cursors.encode({"at": page[-1].last_activity_at.isoformat(), "id": str(page[-1].id)})
        if more
        else None
    )
    return ConversationPage(items=[_conversation(r, clock) for r in page], next_cursor=next_cursor)


async def _fetch(session: AsyncSession, who: Principal, conversation_id: UUID) -> Conversation:
    clock = await _clock(session, who)
    row = (
        await session.execute(
            text(
                f"select {_COLUMNS} from public.conversations c "  # noqa: S608
                "where c.id = :id and c.deleted_at is null"
            ),
            {"id": conversation_id},
        )
    ).one_or_none()
    if row is None:
        raise NotFoundError
    return _conversation(row, clock)


def _upload(row: Any) -> Upload:
    return Upload(
        id=row.id,
        file_name=row.file_name,
        size_bytes=row.size_bytes,
        content_type=row.content_type,
        status=UploadStatus(row.status),
        error_code=UploadErrorCode(row.error_code) if row.error_code else None,
        sheets=list(row.sheets or []),
        selected_sheet=row.selected_sheet,
        profile=FileProfile.model_validate(row.profile) if row.profile else None,
        uploaded_at=None if row.status == "pending" else row.created_at,
    )


async def get_conversation(
    session: AsyncSession, who: Principal, conversation_id: UUID
) -> ConversationDetail:
    conversation = await _fetch(session, who, conversation_id)
    row = (await session.execute(_UPLOAD, {"id": conversation_id})).one_or_none()
    return ConversationDetail(**conversation.model_dump(), upload=_upload(row) if row else None)


async def update_conversation(
    session: AsyncSession, who: Principal, conversation_id: UUID, body: ConversationUpdate
) -> Conversation:
    changes = body.model_dump(exclude_unset=True)
    assignments: list[str] = []
    params: dict[str, Any] = {"id": conversation_id}
    if (title := changes.get("title")) is not None:
        if not title.strip():
            raise BusinessRuleError
        assignments.append("title = :title")
        params["title"] = title.strip()
    for field, column in (("pinned", "pinned_at"), ("archived", "archived_at")):
        if changes.get(field) is not None:
            assignments.append(
                f"{column} = case when :{field} then coalesce({column}, now()) else null end"
            )
            params[field] = changes[field]
    updated = (
        await session.execute(
            text(
                f"update public.conversations set {', '.join(assignments)} "  # noqa: S608
                "where id = :id and deleted_at is null returning id"
            ),
            params,
        )
    ).one_or_none()
    if updated is None:
        raise NotFoundError
    return await _fetch(session, who, conversation_id)


async def delete_conversation(session: AsyncSession, who: Principal, conversation_id: UUID) -> None:
    deleted = (
        await session.execute(
            text(
                "update public.conversations set deleted_at = now() "
                "where id = :id and deleted_at is null returning id"
            ),
            {"id": conversation_id},
        )
    ).one_or_none()
    if deleted is None:
        raise NotFoundError
    await audit.log_event(session, who, "conversation.deleted", "conversation", conversation_id)


async def restore_conversation(
    session: AsyncSession, who: Principal, conversation_id: UUID
) -> Conversation:
    restored = (
        await session.execute(
            text(
                "update public.conversations set deleted_at = null where id = :id "
                "and deleted_at is not null "
                "and deleted_at > now() - make_interval(days => :days) returning id"
            ),
            {"id": conversation_id, "days": RESTORE_WINDOW_DAYS},
        )
    ).one_or_none()
    if restored is None:
        raise NotFoundError
    return await _fetch(session, who, conversation_id)
