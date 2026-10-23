"""Uploads: signed direct-to-storage upload, file profile and completion."""

from __future__ import annotations

from datetime import date
from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from api.schemas.base import ApiModel, RequestModel
from api.schemas.enums import (
    ColumnType,
    SourceKind,
    UploadErrorCode,
    UploadStatus,
)

ALLOWED_EXTENSIONS = (".xlsx", ".xls", ".csv")
"""Macro-enabled formats such as .xlsm are rejected (S11). Content is re-checked by the worker."""
ALLOWED_CONTENT_TYPES = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
)


class UploadCreate(RequestModel):
    """Step 1: ask for a signed upload URL. The browser then uploads the file straight to
    storage, because Vercel caps request bodies at 4.5 MB."""

    file_name: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    content_type: str = Field(max_length=100)

    @model_validator(mode="after")
    def _supported_file(self) -> Self:
        if not self.file_name.lower().endswith(ALLOWED_EXTENSIONS):
            raise ValueError("unsupported file extension")
        if self.content_type not in ALLOWED_CONTENT_TYPES:
            raise ValueError("unsupported content type")
        return self


class UploadTicket(ApiModel):
    upload_id: UUID
    upload_url: str
    """Signed URL, valid for a short time."""
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str] = Field(default_factory=dict)
    """Headers the browser must send with the upload."""
    expires_at: AwareDatetime


class UploadCompleted(ApiModel):
    """Step 2 result: the conversation and its digest job."""

    conversation_id: UUID
    job_id: UUID


class ColumnProfile(ApiModel):
    name: str
    inferred_type: ColumnType
    samples: list[str] = Field(max_length=5)


class SheetProfile(ApiModel):
    name: str
    row_count: int = Field(ge=0)
    columns: list[ColumnProfile]


class FileProfile(ApiModel):
    source_kind: SourceKind
    sheets: list[SheetProfile]
    date_from: date | None
    date_to: date | None


class Upload(ApiModel):
    id: UUID
    file_name: str
    size_bytes: int
    content_type: str
    status: UploadStatus
    error_code: UploadErrorCode | None
    sheets: list[str]
    selected_sheet: str | None
    profile: FileProfile | None
    uploaded_at: AwareDatetime | None
