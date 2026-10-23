"""`/v1/uploads`: signed direct-to-storage upload, then completion."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from api.domain.errors import NotImplementedYetError
from api.routers._common import IdempotencyKey, bearer_scheme, errors
from api.schemas import UploadCompleted, UploadCreate, UploadTicket

router = APIRouter(
    prefix="/v1/uploads",
    tags=["uploads"],
    dependencies=[Depends(bearer_scheme)],
    responses=errors(),
)


@router.post("", status_code=201, responses=errors(422))
async def create_upload(body: UploadCreate) -> UploadTicket:
    """Reserve an upload and return a signed URL. The browser then uploads the file straight to
    storage (Vercel caps request bodies at 4.5 MB)."""
    raise NotImplementedYetError


@router.post("/{upload_id}/complete", status_code=201, responses=errors(404, 409, 422))
async def complete_upload(
    upload_id: UUID,
    idempotency_key: IdempotencyKey = None,
) -> UploadCompleted:
    """Verify the object exists, create the conversation and its digest job, spawn the worker."""
    raise NotImplementedYetError
