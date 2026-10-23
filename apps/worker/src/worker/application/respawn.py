"""Re-spawn stuck jobs (R3): queued ones nobody claimed and running ones whose worker died.

Handlers are idempotent by job id (conditional claim, one published run per job), so spawning a
job that turns out to be alive is harmless: the duplicate cannot claim it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

import structlog

from worker.domain.jobs import JobClaim, StuckJob, new_ref
from worker.ports.conversation_stager import ConversationStager
from worker.ports.job_repository import JobRepository
from worker.ports.job_spawner import JobSpawner

DEFAULT_QUEUED_AFTER = timedelta(minutes=2)


@dataclass(frozen=True)
class RespawnReport:
    spawned: int = 0
    failed: int = 0
    errors: int = 0


class RespawnStuckJobs:
    def __init__(
        self,
        jobs: JobRepository,
        conversations: ConversationStager,
        spawner: JobSpawner,
        *,
        queued_after: timedelta = DEFAULT_QUEUED_AFTER,
    ) -> None:
        self._jobs = jobs
        self._conversations = conversations
        self._spawner = spawner
        self._queued_after = queued_after
        self._log = structlog.get_logger()

    def __call__(self) -> RespawnReport:
        spawned = failed = errors = 0
        for job in self._jobs.find_stuck(queued_after=self._queued_after):
            if job.exhausted:
                self._give_up(job)
                failed += 1
                continue
            try:
                self._spawner.spawn(job.kind, job.job_id)
            except Exception:
                self._log.exception("respawn.spawn_failed", job_id=str(job.job_id))
                errors += 1
                continue
            self._log.info("respawn.spawned", job_id=str(job.job_id), kind=job.kind)
            spawned += 1
        return RespawnReport(spawned, failed, errors)

    def _give_up(self, job: StuckJob) -> None:
        claim = JobClaim(job.job_id, job.tenant_id, job.conversation_id, job.kind, {}, job.attempts)
        self._jobs.finish(claim, "failed", error_ref=new_ref())
        self._conversations.set_conversation_stage(claim, "failed")
        self._log.error("respawn.exhausted", job_id=str(job.job_id), kind=job.kind)
