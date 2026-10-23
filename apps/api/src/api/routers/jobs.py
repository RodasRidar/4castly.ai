"""`/v1/jobs`: digest and forecast job state."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from api.domain.errors import NotImplementedYetError
from api.routers._common import EventStreamResponse, bearer_scheme, errors
from api.schemas import Job, JobUpdateEvent

router = APIRouter(
    prefix="/v1/jobs", tags=["jobs"], dependencies=[Depends(bearer_scheme)], responses=errors()
)


@router.get("/{job_id}", responses=errors(404, 422))
async def get_job(job_id: UUID) -> Job:
    """Real stages and `processed / total`; polling fallback for the event stream."""
    raise NotImplementedYetError


@router.get(
    "/{job_id}/events",
    response_class=EventStreamResponse,
    responses={
        200: {"model": JobUpdateEvent, "description": "`job.update` on every change."},
        **errors(404, 422),
    },
)
async def stream_job_events(job_id: UUID) -> None:
    """Server-sent events for the stepper."""
    raise NotImplementedYetError


@router.post("/{job_id}/cancel", responses=errors(404, 409, 422))
async def cancel_job(job_id: UUID) -> Job:
    """Cancel digestion ("Cancelar"). The job stops at the next safe point."""
    raise NotImplementedYetError
