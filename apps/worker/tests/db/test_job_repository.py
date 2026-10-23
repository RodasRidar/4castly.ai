"""Job lifecycle in PostgreSQL: claim, heartbeat, stages, cancellation, stuck detection (R1-R3)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import Engine

from worker.adapters.db.jobs import SqlJobRepository

from .conftest import DictConnection, Tenant

STALE = timedelta(minutes=10)


def job(admin: DictConnection, tenant: Tenant) -> dict:
    row = admin.execute("select * from public.jobs where id = %s", [tenant.job_id]).fetchone()
    assert row is not None
    return row


def repo(engine: Engine) -> SqlJobRepository:
    return SqlJobRepository(engine, stale_after=STALE, max_attempts=3)


class TestClaim:
    def test_a_queued_job_is_claimed_once(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        claim = repo(engine).claim(tenant.job_id)

        assert claim is not None
        assert (claim.tenant_id, claim.conversation_id, claim.kind) == (
            tenant.id,
            tenant.conversation_id,
            "digest",
        )
        assert claim.params == {"lead_time_days": 30}
        assert claim.attempts == 1
        row = job(admin, tenant)
        assert row["status"] == "running"
        assert row["started_at"] is not None
        assert row["heartbeat_at"] is not None

    def test_a_duplicate_spawn_cannot_claim_a_running_job(
        self, engine: Engine, tenant: Tenant
    ) -> None:
        first = repo(engine).claim(tenant.job_id)
        second = repo(engine).claim(tenant.job_id)

        assert first is not None
        assert second is None

    def test_a_job_with_a_stale_heartbeat_is_taken_over(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        repo(engine).claim(tenant.job_id)
        admin.execute(
            "update public.jobs set heartbeat_at = now() - interval '11 minutes' where id = %s",
            [tenant.job_id],
        )

        retaken = repo(engine).claim(tenant.job_id)

        assert retaken is not None
        assert retaken.attempts == 2

    def test_a_running_job_without_any_heartbeat_counts_as_stale(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        admin.execute(
            "update public.jobs set status = 'running', heartbeat_at = null where id = %s",
            [tenant.job_id],
        )

        assert repo(engine).claim(tenant.job_id) is not None

    def test_attempts_are_capped(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        admin.execute(
            "update public.jobs set status = 'running', attempts = 3, "
            "heartbeat_at = now() - interval '1 hour' where id = %s",
            [tenant.job_id],
        )

        assert repo(engine).claim(tenant.job_id) is None

    def test_finished_jobs_are_never_claimed(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        for status in ("succeeded", "failed", "cancelled"):
            admin.execute(
                "update public.jobs set status = %s where id = %s", [status, tenant.job_id]
            )

            assert repo(engine).claim(tenant.job_id) is None, status

    def test_an_unknown_job_is_not_claimed(self, engine: Engine) -> None:
        import uuid  # noqa: PLC0415

        assert repo(engine).claim(uuid.uuid4()) is None


class TestProgress:
    def test_stages_are_recorded_once_each_with_progress(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        claim = repo(engine).claim(tenant.job_id)
        assert claim is not None

        repo(engine).set_stage(claim, "reading_file")
        repo(engine).set_stage(claim, "reading_file", processed=3, total=26)
        repo(engine).set_stage(claim, "identifying_columns")

        row = job(admin, tenant)
        assert (row["stage"], row["processed"], row["total"]) == ("identifying_columns", None, None)
        events = admin.execute(
            "select stage from public.job_events where job_id = %s order by id", [tenant.job_id]
        ).fetchall()
        assert [e["stage"] for e in events] == ["reading_file", "identifying_columns"]

    def test_progress_counts_are_stored_while_the_stage_runs(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        claim = repo(engine).claim(tenant.job_id)
        assert claim is not None

        repo(engine).set_stage(claim, "calculating_forecast", processed=14, total=26)

        row = job(admin, tenant)
        assert (row["processed"], row["total"]) == (14, 26)

    def test_heartbeat_moves_the_timestamp_forward(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        claim = repo(engine).claim(tenant.job_id)
        assert claim is not None
        admin.execute(
            "update public.jobs set heartbeat_at = now() - interval '5 minutes' where id = %s",
            [tenant.job_id],
        )

        repo(engine).heartbeat(claim)

        age = admin.execute(
            "select extract(epoch from now() - heartbeat_at) as s from public.jobs where id = %s",
            [tenant.job_id],
        ).fetchone()
        assert age is not None
        assert age["s"] < 5

    def test_cancellation_is_visible_to_the_worker(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        claim = repo(engine).claim(tenant.job_id)
        assert claim is not None
        assert not repo(engine).cancel_requested(claim)

        admin.execute(
            "update public.jobs set cancel_requested = true where id = %s", [tenant.job_id]
        )

        assert repo(engine).cancel_requested(claim)


class TestFinish:
    def test_success_and_failure_are_recorded_with_a_support_reference(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        claim = repo(engine).claim(tenant.job_id)
        assert claim is not None

        repo(engine).finish(claim, "failed", error_ref="K7Q2WX")

        row = job(admin, tenant)
        assert (row["status"], row["error_ref"]) == ("failed", "K7Q2WX")
        assert row["finished_at"] is not None

    def test_a_finished_job_cannot_be_overwritten_by_a_late_worker(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        claim = repo(engine).claim(tenant.job_id)
        assert claim is not None
        admin.execute("update public.jobs set status = 'cancelled' where id = %s", [tenant.job_id])

        repo(engine).finish(claim, "succeeded")

        assert job(admin, tenant)["status"] == "cancelled"


class TestStuckJobs:
    def test_finds_unclaimed_and_abandoned_jobs_but_not_healthy_ones(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        # queued just now: healthy
        assert [s.job_id for s in repo(engine).find_stuck(queued_after=timedelta(minutes=2))] == []

        admin.execute(
            "update public.jobs set created_at = now() - interval '5 minutes' where id = %s",
            [tenant.job_id],
        )
        stuck = repo(engine).find_stuck(queued_after=timedelta(minutes=2))
        assert [(s.job_id, s.kind, s.exhausted) for s in stuck] == [
            (tenant.job_id, "digest", False)
        ]

        repo(engine).claim(tenant.job_id)  # running with a fresh heartbeat: healthy
        assert repo(engine).find_stuck(queued_after=timedelta(minutes=2)) == []

        admin.execute(
            "update public.jobs set heartbeat_at = now() - interval '11 minutes' where id = %s",
            [tenant.job_id],
        )
        assert [s.job_id for s in repo(engine).find_stuck(queued_after=timedelta(minutes=2))] == [
            tenant.job_id
        ]

    def test_jobs_out_of_attempts_are_reported_as_exhausted(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        admin.execute(
            "update public.jobs set status = 'running', attempts = 3, "
            "heartbeat_at = now() - interval '1 hour' where id = %s",
            [tenant.job_id],
        )

        [stuck] = repo(engine).find_stuck(queued_after=timedelta(minutes=2))

        assert stuck.exhausted
