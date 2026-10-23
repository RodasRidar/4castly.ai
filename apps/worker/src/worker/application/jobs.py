"""Running a claimed job: stages, cancellation, heartbeats and what a failure means (R1-R5)."""

from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum
from uuid import UUID

import structlog

from worker.domain.errors import JobCancelledError, PermanentJobError
from worker.domain.jobs import JobClaim, new_ref
from worker.ports.job_repository import JobRepository
from worker.ports.run_repository import DigestRepository


class JobOutcome(StrEnum):
    SUCCEEDED = "succeeded"
    FAILED_HANDLED = "failed_handled"
    """The handler already told the user why (for example an unreadable file)."""


class JobContext:
    """What a handler may do while it runs: report a stage, or confirm it should keep going."""

    def __init__(self, claim: JobClaim, jobs: JobRepository) -> None:
        self.claim = claim
        self._jobs = jobs

    def checkpoint(self) -> None:
        """Between units of work: stop if the user cancelled, otherwise show the job is alive."""
        if self._jobs.cancel_requested(self.claim):
            raise JobCancelledError
        self._jobs.heartbeat(self.claim)

    def stage(self, name: str, *, processed: int | None = None, total: int | None = None) -> None:
        """Enter a stage (a safe point to cancel) or report progress inside it."""
        if self._jobs.cancel_requested(self.claim):
            raise JobCancelledError
        self._jobs.set_stage(self.claim, name, processed=processed, total=total)


Handler = Callable[[JobContext], JobOutcome]


class JobRunner:
    """Claims a job and runs a handler, turning its outcome into the job's final state.

    Transient errors release the job and propagate, so Modal's retries (with backoff) pick it up;
    on the last attempt, and for deterministic errors, the job fails with a short support reference.
    Error text is logged, never stored on a row the UI can read.
    """

    def __init__(
        self, jobs: JobRepository, conversations: DigestRepository, *, max_attempts: int
    ) -> None:
        self._jobs = jobs
        self._conversations = conversations
        self._max_attempts = max_attempts
        self._log = structlog.get_logger()

    def run(self, job_id: UUID, handler: Handler) -> str:
        claim = self._jobs.claim(job_id)
        if claim is None:
            self._log.info("job.not_claimable", job_id=str(job_id))
            return "skipped"
        structlog.contextvars.bind_contextvars(
            job_id=str(claim.job_id), tenant_id=str(claim.tenant_id), kind=claim.kind
        )
        try:
            outcome = handler(JobContext(claim, self._jobs))
        except JobCancelledError:
            self._jobs.finish(claim, "cancelled")
            self._conversations.set_conversation_stage(claim, "cancelled")
            self._log.info("job.cancelled")
            return "cancelled"
        except PermanentJobError:
            self._log.exception("job.failed_permanently")
            return self._fail(claim)
        except Exception:
            self._log.exception("job.error", attempt=claim.attempts)
            if claim.attempts >= self._max_attempts:
                return self._fail(claim)
            self._jobs.release(claim)
            raise
        if outcome is JobOutcome.SUCCEEDED:
            self._jobs.finish(claim, "succeeded")
            self._log.info("job.succeeded")
            return "succeeded"
        self._jobs.finish(claim, "failed", error_ref=new_ref())
        self._log.info("job.failed_handled")
        return "failed"

    def _fail(self, claim: JobClaim) -> str:
        self._jobs.finish(claim, "failed", error_ref=new_ref())
        self._conversations.set_conversation_stage(claim, "failed")
        return "failed"
