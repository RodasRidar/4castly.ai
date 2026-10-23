from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class SignedUpload:
    url: str
    headers: dict[str, str]
    expires_at: datetime


@dataclass(frozen=True)
class SignedDownload:
    url: str
    expires_at: datetime


@dataclass(frozen=True)
class StoredObject:
    size_bytes: int
    head: bytes
    """First bytes of the object, enough to recognise the file type by content (S11)."""


class ObjectStorage(Protocol):
    """Private bucket, objects under `<tenant_id>/` (S6)."""

    async def create_upload_url(self, path: str, content_type: str) -> SignedUpload: ...

    async def stat(self, path: str) -> StoredObject | None:
        """`None` when the object does not exist."""
        ...

    async def create_download_url(self, path: str, *, ttl_seconds: int = 60) -> SignedDownload: ...

    async def put(self, path: str, data: bytes, content_type: str) -> None: ...
