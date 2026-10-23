"""Digest and forecast jobs. Stages are real transitions, never fake percentages."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, Field

from api.schemas.base import ApiModel
from api.schemas.enums import JobKind, JobStage, JobStatus, StageState


class JobStageInfo(ApiModel):
    stage: JobStage
    state: StageState


class Job(ApiModel):
    id: UUID
    kind: JobKind
    status: JobStatus
    conversation_id: UUID
    stage: JobStage | None
    stages: list[JobStageInfo]
    """Only the stages of this job, in order: the stepper renders exactly these."""
    processed: int | None = Field(default=None, ge=0)
    total: int | None = Field(default=None, ge=0)
    """Products processed so far / to process, when known. No percentage is ever sent."""
    cancel_requested: bool
    error_ref: str | None
    """Short support code when the job failed."""
    created_at: AwareDatetime
    finished_at: AwareDatetime | None


class JobAccepted(ApiModel):
    """202 body for operations that enqueue a job."""

    job_id: UUID
    conversation_id: UUID


class JobUpdateEvent(ApiModel):
    """SSE `GET /v1/jobs/{id}/events`: sent on every stage or progress change and once at the
    end. Wire format: `event: job.update` and `data: <this object as JSON>`."""

    event: Literal["job.update"] = "job.update"
    job: Job
