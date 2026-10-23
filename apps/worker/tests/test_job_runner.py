"""Claiming, stages, cancellation and what happens when a handler fails (R1, R2, R5)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from worker.application.jobs import JobContext, JobOutcome, JobRunner
from worker.domain.errors import JobCancelledError, PermanentJobError

from .fakes import FakeDigestRepo, FakeJobs, make_claim


def runner(jobs: FakeJobs, conversations: FakeDigestRepo, max_attempts: int = 3) -> JobRunner:
    return JobRunner(jobs, conversations, max_attempts=max_attempts)


def test_a_successful_handler_finishes_the_job_as_succeeded() -> None:
    claim = make_claim()
    jobs, conversations = FakeJobs(claim), FakeDigestRepo()

    result = runner(jobs, conversations).run(claim.job_id, lambda ctx: JobOutcome.SUCCEEDED)

    assert result == "succeeded"
    assert jobs.finished == ("succeeded", None)


def test_a_job_that_cannot_be_claimed_is_skipped_quietly() -> None:
    jobs, conversations = FakeJobs(None), FakeDigestRepo()

    result = runner(jobs, conversations).run(make_claim().job_id, lambda ctx: pytest.fail("ran"))

    assert result == "skipped"
    assert jobs.finished is None


def test_a_handled_failure_fails_the_job_with_a_support_reference_and_no_retry() -> None:
    claim = make_claim()
    jobs, conversations = FakeJobs(claim), FakeDigestRepo()

    result = runner(jobs, conversations).run(claim.job_id, lambda ctx: JobOutcome.FAILED_HANDLED)

    assert result == "failed"
    assert jobs.finished is not None
    assert jobs.finished[0] == "failed"
    assert jobs.finished[1]
    assert conversations.stages == []  # the handler already set the conversation stage


def test_a_permanent_error_fails_fast_without_a_retry() -> None:
    claim = make_claim()
    jobs, conversations = FakeJobs(claim), FakeDigestRepo()

    def handler(ctx: JobContext) -> JobOutcome:
        raise PermanentJobError("the confirmed plan is missing")

    result = runner(jobs, conversations).run(claim.job_id, handler)

    assert result == "failed"
    assert conversations.stages == ["failed"]
    assert jobs.finished is not None
    assert jobs.finished[1]
    assert not jobs.released


def test_cancellation_between_stages_stops_the_job_and_the_conversation() -> None:
    claim = make_claim()
    jobs, conversations = FakeJobs(claim, cancel_after_stages=1), FakeDigestRepo()

    def handler(ctx: JobContext) -> JobOutcome:
        ctx.stage("reading_file")
        ctx.stage("identifying_columns")  # the cancel flag is seen here
        return JobOutcome.SUCCEEDED

    result = runner(jobs, conversations).run(claim.job_id, handler)

    assert result == "cancelled"
    assert jobs.stages == ["reading_file"]
    assert jobs.finished == ("cancelled", None)
    assert conversations.stages == ["cancelled"]


def test_a_transient_error_releases_the_job_and_propagates_for_the_platform_retry() -> None:
    claim = make_claim()
    jobs, conversations = FakeJobs(claim), FakeDigestRepo()

    def handler(ctx: JobContext) -> JobOutcome:
        raise ConnectionError("database restarting")

    with pytest.raises(ConnectionError):
        runner(jobs, conversations).run(claim.job_id, handler)

    assert jobs.released
    assert jobs.status == "queued"  # claimable again at once, no ten-minute wait
    assert jobs.finished is None


def test_the_last_attempt_fails_for_good_instead_of_retrying() -> None:
    claim = make_claim()
    claim = replace(claim, attempts=3)
    jobs, conversations = FakeJobs(claim), FakeDigestRepo()

    def handler(ctx: JobContext) -> JobOutcome:
        raise ConnectionError("still down")

    result = runner(jobs, conversations, max_attempts=3).run(claim.job_id, handler)

    assert result == "failed"
    assert jobs.finished is not None
    assert jobs.finished[0] == "failed"
    assert conversations.stages == ["failed"]


def test_error_text_never_reaches_the_job_row() -> None:
    claim = make_claim()
    claim = replace(claim, attempts=3)
    jobs, conversations = FakeJobs(claim), FakeDigestRepo()

    def handler(ctx: JobContext) -> JobOutcome:
        raise RuntimeError("secret customer name Droguería Lima")

    runner(jobs, conversations, max_attempts=3).run(claim.job_id, handler)

    assert jobs.finished is not None
    assert "Droguería" not in str(jobs.finished)
    assert len(jobs.finished[1] or "") == 6


class TestJobContext:
    def test_stage_records_progress_and_checkpoint_beats_the_heart(self) -> None:
        claim = make_claim()
        jobs = FakeJobs(claim)
        ctx = JobContext(claim, jobs)

        ctx.stage("calculating_forecast", processed=3, total=10)
        ctx.checkpoint()

        assert jobs.stages == ["calculating_forecast"]
        assert jobs.progress == [(3, 10)]
        assert jobs.heartbeats == 1

    def test_checkpoint_raises_once_cancellation_is_requested(self) -> None:
        claim = make_claim()
        ctx = JobContext(claim, FakeJobs(claim, cancel_after_stages=0))

        with pytest.raises(JobCancelledError):
            ctx.checkpoint()
