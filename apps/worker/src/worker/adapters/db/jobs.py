"""`JobRepository` in PostgreSQL. Time comes from the database, so worker clocks never matter."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from sqlalchemy import Engine, text

from worker.domain.jobs import JobClaim, StuckJob

_CLAIM = text(
    """
    update public.jobs
       set status = 'running', attempts = attempts + 1,
           started_at = coalesce(started_at, now()), heartbeat_at = now()
     where id = :job_id
       and attempts < :max_attempts
       and (status = 'queued'
            or (status = 'running'
                and (heartbeat_at is null
                     or heartbeat_at < now() - make_interval(secs => :stale_secs))))
    returning id, tenant_id, conversation_id, kind, params, attempts, traceparent
    """
)
_STUCK = text(
    """
    select id, tenant_id, conversation_id, kind, status, attempts
      from public.jobs
     where (status = 'queued' and created_at < now() - make_interval(secs => :queued_secs))
        or (status = 'running'
            and (heartbeat_at is null
                 or heartbeat_at < now() - make_interval(secs => :stale_secs)))
     order by created_at
     limit :limit
    """
)


class SqlJobRepository:
    def __init__(self, engine: Engine, *, stale_after: timedelta, max_attempts: int) -> None:
        self._engine = engine
        self._stale_secs = stale_after.total_seconds()
        self._max_attempts = max_attempts

    def claim(self, job_id: UUID) -> JobClaim | None:
        with self._engine.begin() as conn:
            row = conn.execute(
                _CLAIM,
                {
                    "job_id": job_id,
                    "max_attempts": self._max_attempts,
                    "stale_secs": self._stale_secs,
                },
            ).one_or_none()
        if row is None:
            return None
        return JobClaim(
            job_id=row.id,
            tenant_id=row.tenant_id,
            conversation_id=row.conversation_id,
            kind=row.kind,
            params=dict(row.params or {}),
            attempts=row.attempts,
            traceparent=row.traceparent,
        )

    def heartbeat(self, claim: JobClaim) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "update public.jobs set heartbeat_at = now() "
                    "where id = :j and tenant_id = :t and status = 'running'"
                ),
                {"j": claim.job_id, "t": claim.tenant_id},
            )

    def set_stage(
        self,
        claim: JobClaim,
        stage: str | None,
        *,
        processed: int | None = None,
        total: int | None = None,
    ) -> None:
        with self._engine.begin() as conn:
            previous = conn.execute(
                text("select stage from public.jobs where id = :j and tenant_id = :t"),
                {"j": claim.job_id, "t": claim.tenant_id},
            ).scalar()
            conn.execute(
                text(
                    "update public.jobs set stage = :s, processed = :p, total = :n, "
                    "heartbeat_at = now() where id = :j and tenant_id = :t and status = 'running'"
                ),
                {"s": stage, "p": processed, "n": total, "j": claim.job_id, "t": claim.tenant_id},
            )
            if stage is not None and stage != previous:
                conn.execute(
                    text(
                        "insert into public.job_events (tenant_id, job_id, stage) "
                        "values (:t, :j, :s)"
                    ),
                    {"t": claim.tenant_id, "j": claim.job_id, "s": stage},
                )

    def cancel_requested(self, claim: JobClaim) -> bool:
        with self._engine.connect() as conn:
            return bool(
                conn.execute(
                    text(
                        "select cancel_requested from public.jobs where id = :j and tenant_id = :t"
                    ),
                    {"j": claim.job_id, "t": claim.tenant_id},
                ).scalar()
            )

    def finish(self, claim: JobClaim, status: str, *, error_ref: str | None = None) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "update public.jobs set status = :s, error_ref = :r, finished_at = now() "
                    "where id = :j and tenant_id = :t and status = 'running'"
                ),
                {"s": status, "r": error_ref, "j": claim.job_id, "t": claim.tenant_id},
            )

    def release(self, claim: JobClaim) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "update public.jobs set status = 'queued', heartbeat_at = null "
                    "where id = :j and tenant_id = :t and status = 'running'"
                ),
                {"j": claim.job_id, "t": claim.tenant_id},
            )

    def find_stuck(self, *, queued_after: timedelta, limit: int = 100) -> list[StuckJob]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                _STUCK,
                {
                    "queued_secs": queued_after.total_seconds(),
                    "stale_secs": self._stale_secs,
                    "limit": limit,
                },
            ).all()
        return [
            StuckJob(
                job_id=r.id,
                tenant_id=r.tenant_id,
                conversation_id=r.conversation_id,
                kind=r.kind,
                status=r.status,
                attempts=r.attempts,
                exhausted=r.attempts >= self._max_attempts,
            )
            for r in rows
        ]
