"""Job state for the stepper: a snapshot, a polling-based event stream and cancellation.

The stream polls Postgres with a short transaction per tick instead of holding a connection (the
pooler and serverless instances make LISTEN/NOTIFY a poor fit). It closes by itself after a while;
the browser reconnects and gets the current state first, so no update is ever missed.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal, Tx
from api.domain.errors import ConflictError, NotFoundError
from api.schemas import Job, JobStageInfo, JobUpdateEvent
from api.schemas.enums import JobKind, JobStage, JobStatus, StageState

POLL_SECONDS = 1.0
MAX_STREAM_SECONDS = 25.0
HEARTBEAT_SECONDS = 15.0

STAGES_BY_KIND: dict[JobKind, tuple[JobStage, ...]] = {
    JobKind.DIGEST: (JobStage.READING_FILE, JobStage.IDENTIFYING_COLUMNS, JobStage.READY),
    JobKind.FORECAST: (JobStage.CLEANING_DATA, JobStage.CALCULATING_FORECAST, JobStage.READY),
}
_TERMINAL = {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED}

_SELECT = text(
    "select id, kind, status, conversation_id, stage, processed, total, cancel_requested, "
    "error_ref, created_at, finished_at from public.jobs where id = :id"
)
_CANCEL_QUEUED = text(
    "update public.jobs set status = 'cancelled', cancel_requested = true, finished_at = now() "
    "where id = :id and status = 'queued' returning conversation_id"
)
_CANCEL_RUNNING = text(
    "update public.jobs set cancel_requested = true where id = :id and status = 'running'"
)
_CONVERSATION_CANCELLED = text(
    "update public.conversations set stage = 'cancelled', last_activity_at = now() where id = :id"
)


def _stage_states(
    kind: JobKind, status: JobStatus, current: str | None
) -> tuple[list[JobStageInfo], JobStage | None]:
    stages = STAGES_BY_KIND[kind]
    if status is JobStatus.SUCCEEDED:
        return [JobStageInfo(stage=s, state=StageState.DONE) for s in stages], None
    position = stages.index(JobStage(current)) if current in stages else None
    infos: list[JobStageInfo] = []
    for index, stage in enumerate(stages):
        if position is None or index > position:
            state = StageState.PENDING
        elif index < position:
            state = StageState.DONE
        else:  # the stage the job was in: active while it runs, otherwise it never completed
            state = StageState.ACTIVE if status is JobStatus.RUNNING else StageState.PENDING
        infos.append(JobStageInfo(stage=stage, state=state))
    active = stages[position] if status is JobStatus.RUNNING and position is not None else None
    return infos, active


def job_from_row(row: Any) -> Job:
    kind, status = JobKind(row.kind), JobStatus(row.status)
    stages, stage = _stage_states(kind, status, row.stage)
    return Job(
        id=row.id,
        kind=kind,
        status=status,
        conversation_id=row.conversation_id,
        stage=stage,
        stages=stages,
        processed=row.processed,
        total=row.total,
        cancel_requested=row.cancel_requested,
        error_ref=row.error_ref,
        created_at=row.created_at,
        finished_at=row.finished_at,
    )


async def get_job(session: AsyncSession, who: Principal, job_id: UUID) -> Job:
    del who
    row = (await session.execute(_SELECT, {"id": job_id})).one_or_none()
    if row is None:
        raise NotFoundError
    return job_from_row(row)


async def cancel_job(session: AsyncSession, who: Principal, job_id: UUID) -> Job:
    """Queued jobs end at once; running ones are asked to stop at their next safe point."""
    current = await get_job(session, who, job_id)
    if current.status in _TERMINAL:
        raise ConflictError("errors.jobFinished")
    queued = (await session.execute(_CANCEL_QUEUED, {"id": job_id})).one_or_none()
    if queued is not None:
        await session.execute(_CONVERSATION_CANCELLED, {"id": queued.conversation_id})
    else:  # claimed in the meantime: ask the worker instead
        await session.execute(_CANCEL_RUNNING, {"id": job_id})
    return await get_job(session, who, job_id)


def frame(job: Job) -> str:
    event = JobUpdateEvent(job=job)
    return f"event: job.update\ndata: {event.model_dump_json()}\n\n"


async def events(tx: Tx, first: Job) -> AsyncGenerator[str]:
    """SSE frames: the current state, then one per change, until the job ends or time is up."""
    job, last = first, first.model_dump_json()
    yield frame(job)
    deadline = time.monotonic() + MAX_STREAM_SECONDS
    quiet_since = time.monotonic()
    while job.status not in _TERMINAL and time.monotonic() < deadline:
        await asyncio.sleep(POLL_SECONDS)
        job = await tx.run(get_job, job.id)
        snapshot = job.model_dump_json()
        if snapshot != last:
            last, quiet_since = snapshot, time.monotonic()
            yield frame(job)
        elif time.monotonic() - quiet_since >= HEARTBEAT_SECONDS:
            quiet_since = time.monotonic()
            yield ": keep-alive\n\n"
