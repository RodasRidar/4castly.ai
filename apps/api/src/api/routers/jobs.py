"""`/v1/jobs`: digest and forecast job state."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from api.auth import CurrentTx
from api.routers._common import EventStreamResponse, bearer_scheme, errors
from api.schemas import Job, JobUpdateEvent
from api.services import jobs

router = APIRouter(
    prefix="/v1/jobs", tags=["jobs"], dependencies=[Depends(bearer_scheme)], responses=errors()
)


@router.get("/{job_id}", responses=errors(404, 422))
async def get_job(job_id: UUID, tx: CurrentTx) -> Job:
    """Real stages and `processed / total`; polling fallback for the event stream."""
    return await tx.run(jobs.get_job, job_id)


@router.get(
    "/{job_id}/events",
    response_class=EventStreamResponse,
    responses={
        200: {"model": JobUpdateEvent, "description": "`job.update` on every change."},
        **errors(404, 422),
    },
)
async def stream_job_events(job_id: UUID, tx: CurrentTx) -> StreamingResponse:
    """Server-sent events for the stepper. The stream ends by itself after a while; reconnect."""
    first = await tx.run(jobs.get_job, job_id)  # a 404 is a normal problem response, not a stream
    return StreamingResponse(
        jobs.events(tx, first),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{job_id}/cancel", responses=errors(404, 409, 422))
async def cancel_job(job_id: UUID, tx: CurrentTx) -> Job:
    """Cancel digestion ("Cancelar"). The job stops at the next safe point."""
    return await tx.run(jobs.cancel_job, job_id)
