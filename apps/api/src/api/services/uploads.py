"""Uploads: reserve a signed URL, then complete (verify the object, open the conversation, start
the digest). Parsing never happens here: the worker reads the file (S11)."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID, uuid4

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal, Tx
from api.domain.errors import BusinessRuleError, ConflictError, NotFoundError
from api.ports.storage import StoredObject
from api.schemas import UploadCompleted, UploadCreate, UploadTicket
from api.services import idempotency, limits

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
"""Largest file accepted (S11). A product decision still to confirm with the first client."""

_ZIP = b"PK\x03\x04"
_OLE = bytes.fromhex("d0cf11e0a1b11ae1")
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")

_INSERT_UPLOAD = text(
    "insert into public.uploads (id, tenant_id, created_by, storage_path, file_name, size_bytes, "
    "content_type) values (:id, :tenant_id, :user_id, :path, :file_name, :size, :content_type)"
)
_FIND_UPLOAD = text(
    "select storage_path, file_name, conversation_id from public.uploads where id = :id"
)
_MARK_FAILED = text(
    "update public.uploads set status = 'failed', error_code = :code where id = :id"
)
_INSERT_CONVERSATION = text(
    "insert into public.conversations (id, tenant_id, created_by, title, stage) "
    "values (:id, :tenant_id, :user_id, :title, 'queued')"
)
_ATTACH_UPLOAD = text(
    "update public.uploads set conversation_id = :conversation_id, status = 'uploaded', "
    "size_bytes = :size where id = :id"
)
_INSERT_JOB = text(
    "insert into public.jobs (id, tenant_id, conversation_id, kind) "
    "values (:id, :tenant_id, :conversation_id, 'digest')"
)
_INSERT_FILE_MESSAGE = text(
    "insert into public.messages (tenant_id, conversation_id, created_by, role, kind, "
    "display_text, payload) values (:tenant_id, :conversation_id, :user_id, 'user', 'file', "
    ":file_name, cast(:payload as jsonb))"
)


def safe_file_name(name: str) -> str:
    """ASCII, no separators and no `..`: the original name stays in the database, not the path."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    suffix = PurePosixPath(ascii_name).suffix.lower()
    stem = _UNSAFE.sub("_", PurePosixPath(ascii_name).stem).strip("._-")
    return f"{re.sub(r'\.{2,}', '.', stem) or 'file'}{_UNSAFE.sub('', suffix)}"


def detected_type_matches(file_name: str, head: bytes) -> bool:
    """Content decides, not the name (S11): zip for .xlsx, OLE or zip for .xls, text for .csv."""
    extension = PurePosixPath(file_name.lower()).suffix
    if extension == ".xlsx":
        return head.startswith(_ZIP)
    if extension == ".xls":
        return head.startswith((_OLE, _ZIP))
    if extension == ".csv":
        return b"\x00" not in head and not head.startswith((_ZIP, _OLE, b"%PDF"))
    return False


async def _reserve(
    session: AsyncSession, who: Principal, upload_id: UUID, path: str, body: Any
) -> None:
    await limits.enforce(
        session, who, "upload", limit=limits.UPLOAD_LIMIT[0], window_seconds=limits.UPLOAD_LIMIT[1]
    )
    await session.execute(
        _INSERT_UPLOAD,
        {
            "id": upload_id,
            "tenant_id": who.tenant_id,
            "user_id": who.user_id,
            "path": path,
            "file_name": body.file_name,
            "size": body.size_bytes,
            "content_type": body.content_type,
        },
    )


async def create_upload(tx: Tx, body: UploadCreate) -> UploadTicket:
    if body.size_bytes > MAX_UPLOAD_BYTES:
        raise BusinessRuleError("errors.fileTooLarge")
    upload_id = uuid4()
    path = f"{tx.who.tenant_id}/{upload_id}/{safe_file_name(body.file_name)}"
    await tx.run(_reserve, upload_id, path, body)
    signed = await tx.container.storage.create_upload_url(path, body.content_type)
    return UploadTicket(
        upload_id=upload_id,
        upload_url=signed.url,
        headers=signed.headers,
        expires_at=signed.expires_at,
    )


async def _load(
    session: AsyncSession, who: Principal, upload_id: UUID, key: str | None, hash_: str
) -> tuple[dict[str, Any] | None, Any]:
    replayed = await idempotency.replay(session, who, key, hash_) if key else None
    if replayed is not None:
        return replayed, None
    row = (await session.execute(_FIND_UPLOAD, {"id": upload_id})).one_or_none()
    if row is None:
        raise NotFoundError
    if row.conversation_id is not None:
        raise ConflictError("errors.uploadAlreadyCompleted")
    return None, row


async def _mark_failed(session: AsyncSession, who: Principal, upload_id: UUID, code: str) -> None:
    del who
    await session.execute(_MARK_FAILED, {"id": upload_id, "code": code})


async def _open_conversation(  # noqa: PLR0913, PLR0917
    session: AsyncSession,
    who: Principal,
    upload_id: UUID,
    file_name: str,
    stored: StoredObject,
    key: str | None,
    hash_: str,
) -> UploadCompleted:
    await limits.enforce(
        session,
        who,
        "upload_complete",
        limit=limits.UPLOAD_LIMIT[0],
        window_seconds=limits.UPLOAD_LIMIT[1],
    )
    conversation_id, job_id = uuid4(), uuid4()
    title = PurePosixPath(file_name).stem[:120] or file_name[:120]
    scope = {"tenant_id": who.tenant_id, "user_id": who.user_id}
    await session.execute(_INSERT_CONVERSATION, {**scope, "id": conversation_id, "title": title})
    await session.execute(
        _ATTACH_UPLOAD,
        {"id": upload_id, "conversation_id": conversation_id, "size": stored.size_bytes},
    )
    await session.execute(
        _INSERT_JOB, {"id": job_id, "tenant_id": who.tenant_id, "conversation_id": conversation_id}
    )
    await session.execute(
        _INSERT_FILE_MESSAGE,
        {
            **scope,
            "conversation_id": conversation_id,
            "file_name": file_name,
            "payload": json.dumps(
                {"kind": "file", "file_name": file_name, "size_bytes": stored.size_bytes}
            ),
        },
    )
    result = UploadCompleted(conversation_id=conversation_id, job_id=job_id)
    if key:
        await idempotency.save(session, who, key, hash_, result.model_dump(mode="json"))
    return result


async def complete_upload(tx: Tx, upload_id: UUID, key: str | None) -> UploadCompleted:
    hash_ = idempotency.request_hash("complete_upload", str(upload_id), None)
    replayed, row = await tx.run(_load, upload_id, key, hash_)
    if replayed is not None:
        return UploadCompleted.model_validate(replayed)

    stored = await tx.container.storage.stat(row.storage_path)
    if stored is None:
        raise ConflictError("errors.uploadMissing")
    if stored.size_bytes > MAX_UPLOAD_BYTES:
        await tx.run(_mark_failed, upload_id, "too_large")
        raise BusinessRuleError("errors.fileTooLarge")
    if not detected_type_matches(row.file_name, stored.head):
        await tx.run(_mark_failed, upload_id, "unsupported_format")
        raise BusinessRuleError("errors.fileTypeMismatch")

    result = await tx.run(_open_conversation, upload_id, row.file_name, stored, key, hash_)
    try:
        await tx.container.spawner.spawn("digest", result.job_id)
    except Exception:
        structlog.get_logger().warning("job.spawn_failed", job_id=str(result.job_id), kind="digest")
    return result
