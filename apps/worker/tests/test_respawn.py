"""Stuck jobs are re-spawned, exhausted ones fail for good (R3); Supabase Free stays awake."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

import pytest

from worker.application.keepalive import KeepaliveError, keepalive
from worker.application.respawn import RespawnStuckJobs
from worker.domain.jobs import StuckJob

from .fakes import FakeDigestRepo, FakeJobs


class Spawner:
    def __init__(self) -> None:
        self.spawned: list[tuple[str, UUID]] = []

    def spawn(self, kind: str, job_id: UUID) -> None:
        self.spawned.append((kind, job_id))


def stuck(kind: str = "forecast", status: str = "running", *, exhausted: bool = False) -> StuckJob:
    return StuckJob(uuid4(), uuid4(), uuid4(), kind, status, 3 if exhausted else 1, exhausted)


def sweep(jobs: list[StuckJob]) -> tuple[Spawner, FakeJobs, FakeDigestRepo, object]:
    fake_jobs, conversations, spawner = FakeJobs(), FakeDigestRepo(), Spawner()
    fake_jobs.stuck = jobs
    report = RespawnStuckJobs(fake_jobs, conversations, spawner)()
    return spawner, fake_jobs, conversations, report


def test_abandoned_and_unclaimed_jobs_are_spawned_again_by_kind() -> None:
    forecast, digest = stuck("forecast"), stuck("digest", "queued")

    spawner, *_ = sweep([forecast, digest])

    assert spawner.spawned == [("forecast", forecast.job_id), ("digest", digest.job_id)]


def test_jobs_out_of_attempts_fail_with_a_reference_and_are_not_spawned() -> None:
    dead = stuck(exhausted=True)

    spawner, jobs, conversations, report = sweep([dead])

    assert spawner.spawned == []
    assert jobs.finished is not None
    assert jobs.finished[0] == "failed"
    assert len(jobs.finished[1] or "") == 6
    assert conversations.stages == ["failed"]
    assert (report.spawned, report.failed) == (0, 1)  # ty: ignore[unresolved-attribute]


def test_a_failing_spawn_does_not_stop_the_sweep() -> None:
    class Flaky(Spawner):
        def spawn(self, kind: str, job_id: UUID) -> None:
            if not self.spawned:
                self.spawned.append(("tried", job_id))
                raise ConnectionError("modal unreachable")
            super().spawn(kind, job_id)

    jobs, conversations, spawner = FakeJobs(), FakeDigestRepo(), Flaky()
    jobs.stuck = [stuck(), stuck("digest")]

    report = RespawnStuckJobs(jobs, conversations, spawner)()

    assert (report.spawned, report.errors) == (1, 1)


def test_nothing_stuck_is_a_quiet_sweep() -> None:
    spawner, _, _, report = sweep([])

    assert spawner.spawned == []
    assert report.spawned == 0  # ty: ignore[unresolved-attribute]


def test_the_queue_wait_before_a_job_counts_as_unclaimed_is_configurable() -> None:
    jobs, conversations = FakeJobs(), FakeDigestRepo()
    seen: list[timedelta] = []
    original = jobs.find_stuck

    def spy(*, queued_after: timedelta, limit: int = 100) -> list[StuckJob]:
        seen.append(queued_after)
        return original(queued_after=queued_after, limit=limit)

    jobs.find_stuck = spy  # ty: ignore[invalid-assignment]
    RespawnStuckJobs(jobs, conversations, Spawner(), queued_after=timedelta(minutes=7))()

    assert seen == [timedelta(minutes=7)]


class TestKeepalive:
    def test_pings_the_database_and_the_api(self) -> None:
        calls: list[str] = []

        result = keepalive(lambda: calls.append("db"), lambda: calls.append("api") or True)

        assert calls == ["db", "api"]
        assert result.database_ok
        assert result.api_ok

    def test_a_dead_database_raises_so_the_platform_alerts(self) -> None:
        def down() -> None:
            raise ConnectionError("no route to host")

        with pytest.raises(KeepaliveError):
            keepalive(down, lambda: True)

    def test_an_unready_api_is_reported_and_raises(self) -> None:
        with pytest.raises(KeepaliveError):
            keepalive(lambda: None, lambda: False)

    def test_the_api_check_is_optional(self) -> None:
        result = keepalive(lambda: None, None)

        assert result.database_ok
        assert result.api_ok is None
