"""Conversations: sidebar list, detail and updates."""

from __future__ import annotations

from typing import Self
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from api.schemas.base import ApiModel, RequestModel
from api.schemas.enums import ConversationGroup, ConversationStage
from api.schemas.uploads import Upload


class Conversation(ApiModel):
    id: UUID
    title: str
    stage: ConversationStage
    group: ConversationGroup
    pinned: bool
    archived: bool
    file_name: str | None
    current_job_id: UUID | None
    """Active job, while digesting or calculating."""
    current_run_id: UUID | None
    """Latest ready run, once the forecast exists."""
    created_at: AwareDatetime
    last_activity_at: AwareDatetime
    deleted_at: AwareDatetime | None
    """Set while a soft delete can still be undone (30 days)."""


class ConversationDetail(Conversation):
    upload: Upload | None


class ConversationPage(ApiModel):
    items: list[Conversation]
    next_cursor: str | None


class ConversationUpdate(RequestModel):
    """PATCH: rename, pin or archive. Omitted fields stay."""

    title: str | None = Field(default=None, min_length=1, max_length=120)
    pinned: bool | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def _needs_a_field(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("send at least one field to update")
        return self
