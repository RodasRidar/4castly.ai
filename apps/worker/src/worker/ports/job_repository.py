from __future__ import annotations

from datetime import timedelta
from typing import Protocol, runtime_checkable
from uuid import UUID

from worker.domain.jobs import JobClaim, StuckJob


@runtime_checkable
class JobRepository(Protocol):
    """The `jobs` table is the source of truth (R1). Every method after `claim` is scoped by the
    claim's tenant."""

    def claim(self, job_id: UUID) -> JobClaim | None:
        """queued -> running, conditionally. None when it is not claimable (duplicate spawn,
        finished, or out of attempts)."""
        ...

    def heartbeat(self, claim: JobClaim) -> None: ...

    def set_stage(
        self,
        claim: JobClaim,
        stage: str | None,
        *,
        processed: int | None = None,
        total: int | None = None,
    ) -> None: ...

    def cancel_requested(self, claim: JobClaim) -> bool: ...

    def finish(self, claim: JobClaim, status: str, *, error_ref: str | None = None) -> None:
        """Only a running job can be finished: a late worker never overwrites a cancellation."""
        ...

    def release(self, claim: JobClaim) -> None:
        """running -> queued after a transient error, so a retry can claim it at once."""
        ...

    def find_stuck(self, *, queued_after: timedelta, limit: int = 100) -> list[StuckJob]: ...
