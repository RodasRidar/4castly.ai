"""Acceptance (B3): a synthetic Kardex and a synthetic template go end to end to a ready run, and a
killed job is re-spawned. Real PostgreSQL, real adapters; only storage is a local directory."""

from __future__ import annotations

import shutil
from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Engine

from tests import files
from worker.adapters.ingestion.plan_matcher import DeterministicPlanProposer
from worker.adapters.storage.local import LocalFileStore
from worker.bootstrap import Worker
from worker.domain.models import DemandSeries, Forecast

from .conftest import DictConnection, Tenant


class ConstantForecaster:
    name = "constant"

    def forecast(self, series: DemandSeries, horizon: int) -> Forecast:
        mean = sum(series.y[-4:]) / 4
        return Forecast(
            series.sku, self.name, series.future_dates(horizon),
            [mean * 0.8] * horizon, [mean] * horizon, [mean * 1.2] * horizon,
        )  # fmt: skip


class RecordingSpawner:
    def __init__(self, worker: Worker, *, run: bool = True) -> None:
        self.worker, self.run, self.spawned = worker, run, []
        self.calls: list[tuple[str, UUID]] = []

    def spawn(self, kind: str, job_id: UUID) -> None:
        self.calls.append((kind, job_id))
        if self.run:  # stands in for Modal starting the function
            (self.worker.run_digest if kind == "digest" else self.worker.run_forecast)(job_id)


def make_worker(engine: Engine, root: Path, forecaster=None) -> Worker:
    return Worker(
        engine,
        store=LocalFileStore(root),
        proposer=DeterministicPlanProposer(),
        forecaster=forecaster or ConstantForecaster(),
    )


def place(root: Path, tenant: Tenant, file: Path, admin: DictConnection) -> None:
    """Put the file where the upload row says it is."""
    admin.execute(
        "update public.uploads set storage_path = %s, file_name = %s where id = %s",
        [f"{tenant.id}/{tenant.upload_id}/{file.name}", file.name, tenant.upload_id],
    )
    target = root / str(tenant.id) / str(tenant.upload_id)
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy(file, target / file.name)


def new_job(admin: DictConnection, tenant: Tenant, kind: str, params: str = "{}") -> UUID:
    job_id = uuid4()
    admin.execute(
        "insert into public.jobs (id, tenant_id, conversation_id, kind, status, params) "
        "values (%s, %s, %s, %s, 'queued', %s::jsonb)",
        [job_id, tenant.id, tenant.conversation_id, kind, params],
    )
    return job_id


def confirm_plan(admin: DictConnection, tenant: Tenant) -> None:
    """What the API does when the user presses "Sí, es correcto"."""
    admin.execute(
        "update public.normalization_plans set confirmed_at = now(), confirmed_by = %s "
        "where upload_id = %s",
        [tenant.user_id, tenant.upload_id],
    )
    admin.execute(
        "update public.conversations set stage = 'confirmed' where id = %s",
        [tenant.conversation_id],
    )
    admin.execute("update public.jobs set status = 'succeeded' where id = %s", [tenant.job_id])


def stages(admin: DictConnection, job_id: UUID) -> list[str]:
    rows = admin.execute(
        "select stage from public.job_events where job_id = %s order by id", [job_id]
    ).fetchall()
    return [r["stage"] for r in rows]


def sales_file(tmp_path: Path) -> Path:
    path = files.write_sales_csv(tmp_path / "plantilla.csv")
    last = files.FIRST_MONDAY + timedelta(weeks=files.WEEKS - 1, days=6)
    with path.open("ab") as handle:
        handle.write(f"{last.strftime('%d/%m/%Y')};QF-0001;Ácido cítrico;0;kg\n".encode("cp1252"))
    return path


def run_both_jobs(
    worker: Worker, admin: DictConnection, tenant: Tenant, params: str = "{}"
) -> tuple[UUID, UUID]:
    digest_id = tenant.job_id
    assert worker.run_digest(digest_id) == "succeeded"
    confirm_plan(admin, tenant)
    forecast_id = new_job(admin, tenant, "forecast", params)
    assert worker.run_forecast(forecast_id) == "succeeded"
    return digest_id, forecast_id


class TestTemplateEndToEnd:
    def test_a_sales_template_reaches_a_ready_run(
        self, engine: Engine, admin: DictConnection, tenant: Tenant, tmp_path: Path
    ) -> None:
        root = tmp_path / "store"
        place(root, tenant, sales_file(tmp_path), admin)
        worker = make_worker(engine, root)

        digest_id, forecast_id = run_both_jobs(worker, admin, tenant, '{"lead_time_days": 21}')

        assert stages(admin, digest_id) == ["reading_file", "identifying_columns"]
        assert stages(admin, forecast_id) == ["cleaning_data", "calculating_forecast"]
        conversation = admin.execute(
            "select stage, current_run_id from public.conversations where id = %s",
            [tenant.conversation_id],
        ).fetchone()
        assert conversation is not None
        assert conversation["stage"] == "ready"
        run = admin.execute(
            "select * from public.forecast_runs where id = %s", [conversation["current_run_id"]]
        ).fetchone()
        assert run is not None
        assert (run["status"], run["horizon_weeks"], run["job_id"]) == ("ready", 12, forecast_id)
        assert run["params"]["lead_time_days"] == 21
        assert "lead_time" not in run["params"]["defaults_used"]
        metrics = admin.execute(
            "select p.code, m.abc_class, m.risk, m.reliability, m.lead_time_days "
            "from public.run_product_metrics m join public.products p "
            "on p.id = m.product_id and p.tenant_id = m.tenant_id "
            "where m.run_id = %s order by p.code",
            [run["id"]],
        ).fetchall()
        assert [m["code"] for m in metrics] == ["QF-0001", "QF-0002", "QF-0003"]
        assert {m["lead_time_days"] for m in metrics} == {21}
        forecasts = admin.execute(
            "select count(*) as n from public.forecasts where run_id = %s", [run["id"]]
        ).fetchone()
        assert forecasts == {"n": 36}
        series = admin.execute(
            "select count(*) as n from public.demand_series where tenant_id = %s", [tenant.id]
        ).fetchone()
        assert series == {"n": 36}
        job = admin.execute(
            "select status, error_ref from public.jobs where id = %s", [forecast_id]
        ).fetchone()
        assert job == {"status": "succeeded", "error_ref": None}

    def test_the_real_model_runs_through_the_same_pipeline(
        self, engine: Engine, admin: DictConnection, tenant: Tenant, tmp_path: Path
    ) -> None:
        from worker.adapters.forecasting import StatsForecastBaseline  # noqa: PLC0415

        root = tmp_path / "store"
        place(root, tenant, sales_file(tmp_path), admin)
        worker = make_worker(engine, root, StatsForecastBaseline("auto_ets", season_length=1))

        run_both_jobs(worker, admin, tenant)

        models = admin.execute(
            "select distinct model from public.forecasts where tenant_id = %s", [tenant.id]
        ).fetchall()
        assert {m["model"] for m in models} == {"statsforecast-auto-ets"}

    def test_a_recalculation_builds_a_new_run_from_the_stored_demand(
        self, engine: Engine, admin: DictConnection, tenant: Tenant, tmp_path: Path
    ) -> None:
        root = tmp_path / "store"
        place(root, tenant, sales_file(tmp_path), admin)
        worker = make_worker(engine, root)
        run_both_jobs(worker, admin, tenant)
        (root / str(tenant.id) / str(tenant.upload_id) / "plantilla.csv").unlink()  # file is gone

        recalc = new_job(admin, tenant, "forecast", '{"recalculate": true, "lead_time_days": 45}')
        assert worker.run_forecast(recalc) == "succeeded"

        runs = admin.execute(
            "select status, params ->> 'lead_time_days' as lead from public.forecast_runs "
            "where tenant_id = %s order by created_at",
            [tenant.id],
        ).fetchall()
        assert runs == [
            {"status": "superseded", "lead": "30"},
            {"status": "ready", "lead": "45"},
        ]


class TestKardexEndToEnd:
    def test_a_kardex_reaches_a_ready_run(
        self,
        engine: Engine,
        admin: DictConnection,
        tenant: Tenant,
        tmp_path: Path,
        kardex_path: Path,
    ) -> None:
        root = tmp_path / "store"
        place(root, tenant, kardex_path, admin)
        worker = make_worker(engine, root)

        run_both_jobs(worker, admin, tenant)

        plan = admin.execute(
            "select plan ->> 'source_kind' as kind, plan -> 'summary' ->> 'products_found' as n "
            "from public.normalization_plans where upload_id = %s",
            [tenant.upload_id],
        ).fetchone()
        assert plan == {"kind": "kardex", "n": "2"}
        stock = admin.execute(
            "select p.code, m.current_stock::float as stock from public.run_product_metrics m "
            "join public.products p on p.id = m.product_id and p.tenant_id = m.tenant_id "
            "where m.tenant_id = %s order by p.code",
            [tenant.id],
        ).fetchall()
        assert stock == [{"code": "A001", "stock": 100.0}, {"code": "B002", "stock": 40.0}]


class TestFailuresAndRecovery:
    def test_an_unreadable_file_ends_in_the_unreadable_stage(
        self, engine: Engine, admin: DictConnection, tenant: Tenant, tmp_path: Path
    ) -> None:
        root = tmp_path / "store"
        place(root, tenant, files.write_encrypted_looking(tmp_path / "x.xlsx"), admin)

        result = make_worker(engine, root).run_digest(tenant.job_id)

        assert result == "failed"
        conversation = admin.execute(
            "select stage from public.conversations where id = %s", [tenant.conversation_id]
        ).fetchone()
        upload = admin.execute(
            "select status, error_code from public.uploads where id = %s", [tenant.upload_id]
        ).fetchone()
        job = admin.execute(
            "select status from public.jobs where id = %s", [tenant.job_id]
        ).fetchone()
        assert conversation == {"stage": "unreadable"}
        assert upload == {"status": "failed", "error_code": "password_protected"}
        assert job == {"status": "failed"}

    def test_a_killed_job_is_respawned_and_completes(
        self, engine: Engine, admin: DictConnection, tenant: Tenant, tmp_path: Path
    ) -> None:
        root = tmp_path / "store"
        place(root, tenant, sales_file(tmp_path), admin)
        worker = make_worker(engine, root)
        assert worker.run_digest(tenant.job_id) == "succeeded"
        confirm_plan(admin, tenant)
        job_id = new_job(admin, tenant, "forecast")
        # A container claims the job and is killed: running, then silent.
        assert worker.jobs.claim(job_id) is not None
        admin.execute(
            "update public.jobs set heartbeat_at = now() - interval '11 minutes' where id = %s",
            [job_id],
        )

        report = worker.respawn_stuck(RecordingSpawner(worker))

        assert report.spawned == 1
        job = admin.execute(
            "select status, attempts from public.jobs where id = %s", [job_id]
        ).fetchone()
        assert job == {"status": "succeeded", "attempts": 2}
        ready = admin.execute(
            "select count(*) as n from public.forecast_runs where job_id = %s and status = 'ready'",
            [job_id],
        ).fetchone()
        assert ready == {"n": 1}

    def test_a_healthy_running_job_is_left_alone(
        self, engine: Engine, admin: DictConnection, tenant: Tenant, tmp_path: Path
    ) -> None:
        worker = make_worker(engine, tmp_path)
        assert worker.jobs.claim(tenant.job_id) is not None
        spawner = RecordingSpawner(worker, run=False)

        report = worker.respawn_stuck(spawner)

        assert (report.spawned, spawner.calls) == (0, [])

    def test_a_duplicate_spawn_after_completion_does_nothing(
        self, engine: Engine, admin: DictConnection, tenant: Tenant, tmp_path: Path
    ) -> None:
        root = tmp_path / "store"
        place(root, tenant, sales_file(tmp_path), admin)
        worker = make_worker(engine, root)
        _, forecast_id = run_both_jobs(worker, admin, tenant)

        assert worker.run_forecast(forecast_id) == "skipped"

        runs = admin.execute(
            "select count(*) as n from public.forecast_runs where tenant_id = %s", [tenant.id]
        ).fetchone()
        assert runs == {"n": 1}


@pytest.fixture(autouse=True)
def _clean_logging_context() -> None:
    import structlog  # noqa: PLC0415

    structlog.contextvars.clear_contextvars()
