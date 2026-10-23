"""In-memory implementations of the ports, for testing control flow without a database."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

from worker.domain.documents import FileProfile, PlanDocument
from worker.domain.jobs import JobClaim, StuckJob
from worker.domain.results import UploadInfo


class FakeJobs:
    """Implements `JobRepository`; keeps the whole history for assertions."""

    def __init__(
        self, claim: JobClaim | None = None, *, cancel_after_stages: int | None = None
    ) -> None:
        self.job = claim
        self.status = "queued"
        self.stages: list[str | None] = []
        self.progress: list[tuple[int | None, int | None]] = []
        self.heartbeats = 0
        self.finished: tuple[str, str | None] | None = None
        self.released = False
        self.cancel_after_stages = cancel_after_stages
        self.stuck: list[StuckJob] = []

    def claim(self, job_id: UUID) -> JobClaim | None:
        if self.job is None or self.job.job_id != job_id or self.status != "queued":
            return None
        self.status = "running"
        return self.job

    def heartbeat(self, claim: JobClaim) -> None:
        self.heartbeats += 1

    def set_stage(self, claim, stage, *, processed=None, total=None) -> None:
        self.stages.append(stage)
        self.progress.append((processed, total))

    def cancel_requested(self, claim: JobClaim) -> bool:
        limit = self.cancel_after_stages
        return limit is not None and len(self.stages) >= limit

    def finish(self, claim: JobClaim, status: str, *, error_ref: str | None = None) -> None:
        self.status = status
        self.finished = (status, error_ref)

    def release(self, claim: JobClaim) -> None:
        self.status = "queued"
        self.released = True

    def find_stuck(self, *, queued_after: timedelta, limit: int = 100) -> list[StuckJob]:
        return self.stuck


@dataclass
class FakeDigestRepo:
    """Implements `DigestRepository`."""

    upload: UploadInfo | None = None
    stages: list[str] = field(default_factory=list)
    saved: dict[str, Any] | None = None
    unreadable: str | None = None

    def load_upload(self, claim: JobClaim) -> UploadInfo | None:
        return self.upload

    def set_conversation_stage(self, claim: JobClaim, stage: str) -> None:
        self.stages.append(stage)

    def save_digest(
        self,
        claim: JobClaim,
        upload: UploadInfo,
        *,
        profile: FileProfile,
        selected_sheet: str | None,
        document: PlanDocument,
        proposed_by: str,
        stage: str,
    ) -> None:
        self.saved = {
            "profile": profile,
            "selected_sheet": selected_sheet,
            "document": document,
            "proposed_by": proposed_by,
            "stage": stage,
        }
        self.stages.append(stage)

    def mark_unreadable(self, claim: JobClaim, upload: UploadInfo, error_code: str) -> None:
        self.unreadable = error_code
        self.stages.append("unreadable")


def make_claim(kind: str = "digest", **params: Any) -> JobClaim:
    return JobClaim(uuid4(), uuid4(), uuid4(), kind, dict(params), 1)


def make_upload(file_name: str) -> UploadInfo:
    return UploadInfo(uuid4(), f"t/u/{file_name}", file_name)


@dataclass
class FakeRunRepo:
    """Implements `RunRepository` in memory."""

    confirmed: tuple[UploadInfo, PlanDocument] | None = None
    overrides: dict[str, Any] = field(default_factory=dict)
    exists: bool = False
    stored_demand: list[Any] = field(default_factory=list)
    previous_params: dict[str, Any] | None = None
    saved_demand: list[Any] = field(default_factory=list)
    published: Any = None
    stages: list[str] = field(default_factory=list)

    def load_confirmed(self, claim: JobClaim) -> tuple[UploadInfo, PlanDocument] | None:
        return self.confirmed

    def load_overrides(self, claim: JobClaim) -> dict[str, Any]:
        return self.overrides

    def run_exists_for_job(self, claim: JobClaim) -> bool:
        return self.exists

    def save_demand(self, claim: JobClaim, upload: UploadInfo, products: Any) -> None:
        self.saved_demand = list(products)

    def load_demand(self, claim: JobClaim) -> list[Any]:
        return self.stored_demand

    def run_params(self, claim: JobClaim) -> dict[str, Any] | None:
        return self.previous_params

    def publish_run(self, claim: JobClaim, result: Any) -> UUID:
        self.published = result
        return uuid4()

    def set_conversation_stage(self, claim: JobClaim, stage: str) -> None:
        self.stages.append(stage)
