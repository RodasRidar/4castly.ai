"""Digest and run persistence against the real schema (tenant scoped, atomic publish)."""

from __future__ import annotations

import json
from datetime import date, timedelta
from uuid import UUID, uuid4

import inventory as inv
import pytest
from sqlalchemy import Engine

from worker.adapters.db.digest import SqlDigestRepository
from worker.adapters.db.jobs import SqlJobRepository
from worker.adapters.db.runs import SqlRunRepository
from worker.domain.documents import (
    ColumnProfile,
    ColumnRef,
    DataSummary,
    DataWarning,
    DateMapping,
    FileProfile,
    NormalizationPlan,
    PlanDocument,
    QuantityMapping,
    SheetProfile,
)
from worker.domain.jobs import JobClaim
from worker.domain.results import (
    DemandPoint,
    ProductDemand,
    ProductRun,
    RunResult,
    UploadInfo,
)

from .conftest import DictConnection, Tenant

DATA_UNTIL = date(2026, 10, 18)


def claim_for(tenant: Tenant, kind: str = "digest") -> JobClaim:
    return JobClaim(tenant.job_id, tenant.id, tenant.conversation_id, kind, {}, 1)


def upload_info(tenant: Tenant) -> UploadInfo:
    return UploadInfo(
        tenant.upload_id, f"{tenant.id}/{tenant.upload_id}/kardex.xlsx", "kardex.xlsx"
    )


PLAN = NormalizationPlan(
    "Ventas", 1, DateMapping("Fecha", "yyyy-mm-dd"), ColumnRef("Cod"), None, QuantityMapping("Cant")
)
DOCUMENT = PlanDocument(
    "tabular",
    PLAN,
    DataSummary(2, date(2026, 1, 5), DATA_UNTIL, 41, 100, 1),
    warnings=(DataWarning("short_history", "warning", 1),),
)
PROFILE = FileProfile(
    "tabular", (SheetProfile("Ventas", 100, (ColumnProfile("Fecha", "date", ("2026-01-05",)),)),)
)


class TestDigestRepository:
    def test_load_upload_is_scoped_to_the_claims_tenant(
        self, engine: Engine, tenant: Tenant
    ) -> None:
        repo = SqlDigestRepository(engine)

        found = repo.load_upload(claim_for(tenant))
        foreign = JobClaim(tenant.job_id, uuid4(), tenant.conversation_id, "digest", {}, 1)

        assert found == upload_info(tenant)
        assert repo.load_upload(foreign) is None

    def test_save_digest_writes_profile_plan_and_stage_together(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        repo = SqlDigestRepository(engine)

        repo.save_digest(
            claim_for(tenant),
            upload_info(tenant),
            profile=PROFILE,
            selected_sheet="Ventas",
            document=DOCUMENT,
            proposed_by="llm",
            stage="awaiting_confirmation",
        )

        upload = admin.execute(
            "select profile, sheets, selected_sheet, status, error_code from public.uploads "
            "where id = %s",
            [tenant.upload_id],
        ).fetchone()
        assert upload == {
            "profile": PROFILE.to_dict(),
            "sheets": ["Ventas"],
            "selected_sheet": "Ventas",
            "status": "readable",
            "error_code": None,
        }
        plan = admin.execute(
            "select plan, proposed_by, confirmed_at from public.normalization_plans "
            "where upload_id = %s",
            [tenant.upload_id],
        ).fetchone()
        assert plan == {"plan": DOCUMENT.to_dict(), "proposed_by": "llm", "confirmed_at": None}
        stage = admin.execute(
            "select stage from public.conversations where id = %s", [tenant.conversation_id]
        ).fetchone()
        assert stage == {"stage": "awaiting_confirmation"}

    def test_a_second_digest_replaces_the_unconfirmed_proposal(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        repo = SqlDigestRepository(engine)
        for proposed_by in ("rules", "llm"):
            repo.save_digest(
                claim_for(tenant),
                upload_info(tenant),
                profile=PROFILE,
                selected_sheet="Ventas",
                document=DOCUMENT,
                proposed_by=proposed_by,
                stage="awaiting_confirmation",
            )

        rows = admin.execute(
            "select proposed_by from public.normalization_plans where upload_id = %s",
            [tenant.upload_id],
        ).fetchall()
        assert rows == [{"proposed_by": "llm"}]

    def test_unreadable_files_are_marked_with_their_code(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        SqlDigestRepository(engine).mark_unreadable(
            claim_for(tenant), upload_info(tenant), "password_protected"
        )

        upload = admin.execute(
            "select status, error_code from public.uploads where id = %s", [tenant.upload_id]
        ).fetchone()
        conversation = admin.execute(
            "select stage from public.conversations where id = %s", [tenant.conversation_id]
        ).fetchone()
        assert upload == {"status": "failed", "error_code": "password_protected"}
        assert conversation == {"stage": "unreadable"}

    def test_conversation_stage_can_be_set_and_touches_activity(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        admin.execute(
            "update public.conversations set last_activity_at = now() - interval '1 day' "
            "where id = %s",
            [tenant.conversation_id],
        )

        SqlDigestRepository(engine).set_conversation_stage(claim_for(tenant), "cancelled")

        row = admin.execute(
            "select stage, last_activity_at > now() - interval '1 minute' as fresh "
            "from public.conversations where id = %s",
            [tenant.conversation_id],
        ).fetchone()
        assert row == {"stage": "cancelled", "fresh": True}


def demand_of(code: str, weeks: int = 20, level: float = 100.0) -> ProductDemand:
    start = DATA_UNTIL - timedelta(days=6) - timedelta(weeks=weeks - 1)
    points = tuple(DemandPoint(start + timedelta(weeks=i), level + i, i == 3) for i in range(weeks))
    return ProductDemand(code, f"Producto {code}", "kg", points, current_stock=250.0)


def product_run(code: str, **overrides: object) -> ProductRun:
    demand = inv.Demand(low=(80.0,) * 12, expected=(100.0,) * 12, high=(130.0,) * 12)
    inputs = inv.ProductInputs(
        stock=250.0, demand=demand, lead_time_days=14, target_coverage_weeks=4
    )
    fields: dict[str, object] = {
        "code": code,
        "abc_class": "A",
        "method": "model",
        "forecaster": "statsforecast-auto-ets",
        "forecast_dates": tuple(inv.week_start(DATA_UNTIL, w) for w in range(1, 13)),
        "demand": demand,
        "analysis": inv.analyze_product(inputs),
        "current_stock": 250.0,
        "lead_time_days": 14,
        "lead_time_overridden": False,
        "target_coverage_weeks": 4,
        "on_order_qty": 0.0,
        "data_until": DATA_UNTIL,
        "reliability": "high",
        "reliability_detail": {"wape_pct": 22.0},
    }
    return ProductRun(**{**fields, **overrides})  # ty: ignore[invalid-argument-type]


def run_result(*codes: str, **product_overrides: object) -> RunResult:
    return RunResult(
        DATA_UNTIL,
        12,
        "weekly",
        {"lead_time_days": 14, "stock_known": True},
        tuple(product_run(c, **product_overrides) for c in codes),
    )


def seed_demand(engine: Engine, tenant: Tenant, *codes: str) -> None:
    repo = SqlRunRepository(engine, today=lambda: DATA_UNTIL + timedelta(days=5))
    repo.save_demand(
        claim_for(tenant, "forecast"), upload_info(tenant), [demand_of(c) for c in codes]
    )


class TestRunRepository:
    def repo(self, engine: Engine) -> SqlRunRepository:
        return SqlRunRepository(engine, today=lambda: DATA_UNTIL + timedelta(days=5))

    def test_only_a_confirmed_plan_is_loaded(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        repo = self.repo(engine)
        SqlDigestRepository(engine).save_digest(
            claim_for(tenant),
            upload_info(tenant),
            profile=PROFILE,
            selected_sheet="Ventas",
            document=DOCUMENT,
            proposed_by="rules",
            stage="awaiting_confirmation",
        )
        assert repo.load_confirmed(claim_for(tenant, "forecast")) is None

        admin.execute(
            "update public.normalization_plans set confirmed_at = now() where upload_id = %s",
            [tenant.upload_id],
        )

        loaded = repo.load_confirmed(claim_for(tenant, "forecast"))
        assert loaded == (upload_info(tenant), DOCUMENT)

    def test_overrides_are_keyed_by_product_code(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1", "B2")
        admin.execute(
            "insert into public.product_overrides (tenant_id, product_id, lead_time_days, "
            "on_order_qty) select tenant_id, id, 45, 500 from public.products "
            "where tenant_id = %s and code = 'A1'",
            [tenant.id],
        )

        overrides = self.repo(engine).load_overrides(claim_for(tenant, "forecast"))

        assert set(overrides) == {"A1"}
        assert (overrides["A1"].lead_time_days, overrides["A1"].on_order_qty) == (45, 500.0)

    def test_demand_is_saved_idempotently_and_replaced_per_upload(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        repo = self.repo(engine)
        claim = claim_for(tenant, "forecast")
        repo.save_demand(claim, upload_info(tenant), [demand_of("A1", 20), demand_of("B2", 20)])

        repo.save_demand(claim, upload_info(tenant), [demand_of("A1", 10)])

        rows = admin.execute(
            "select p.code, count(*) as n from public.demand_series d join public.products p "
            "on p.id = d.product_id where d.tenant_id = %s group by p.code order by p.code",
            [tenant.id],
        ).fetchall()
        assert rows == [{"code": "A1", "n": 10}]
        censored = admin.execute(
            "select count(*) as n from public.demand_series where tenant_id = %s and censored",
            [tenant.id],
        ).fetchone()
        assert censored is not None
        assert censored["n"] == 1

    def test_products_are_updated_not_duplicated(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        repo = self.repo(engine)
        claim = claim_for(tenant, "forecast")
        repo.save_demand(claim, upload_info(tenant), [demand_of("A1")])
        renamed = ProductDemand("A1", "Nombre nuevo", "L", demand_of("A1").points, None)

        repo.save_demand(claim, upload_info(tenant), [renamed])

        row = admin.execute(
            "select count(*) over () as n, name, uom from public.products where tenant_id = %s",
            [tenant.id],
        ).fetchone()
        assert row == {"n": 1, "name": "Nombre nuevo", "uom": "L"}

    def test_publish_creates_a_ready_run_with_forecasts_and_metrics(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1", "B2")

        run_id = self.repo(engine).publish_run(
            claim_for(tenant, "forecast"), run_result("A1", "B2")
        )

        run = admin.execute("select * from public.forecast_runs where id = %s", [run_id]).fetchone()
        assert run is not None
        assert (run["status"], run["horizon_weeks"], run["granularity"], run["job_id"]) == (
            "ready",
            12,
            "weekly",
            tenant.job_id,
        )
        assert run["params"] == {"lead_time_days": 14, "stock_known": True}
        forecasts = admin.execute(
            "select count(*) as n, min(horizon) as first, "
            "bool_and(p10 <= p50 and p50 <= p90) as ok "
            "from public.forecasts where run_id = %s",
            [run_id],
        ).fetchone()
        assert forecasts == {"n": 24, "first": date(2026, 10, 19), "ok": True}
        metric = admin.execute(
            "select abc_class, risk, reliability, buy_before_action, typical_demand_expected, "
            "suggested_qty_low, lead_time_days from public.run_product_metrics "
            "where run_id = %s order by abc_class limit 1",
            [run_id],
        ).fetchone()
        assert metric is not None
        assert metric["abc_class"] == "A"
        assert float(metric["typical_demand_expected"]) == 100.0
        conversation = admin.execute(
            "select stage, current_run_id from public.conversations where id = %s",
            [tenant.conversation_id],
        ).fetchone()
        assert conversation == {"stage": "ready", "current_run_id": run_id}

    def test_a_new_run_supersedes_the_previous_one(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1")
        repo = self.repo(engine)
        first = repo.publish_run(claim_for(tenant, "forecast"), run_result("A1"))
        second_job = uuid4()
        admin.execute("update public.jobs set status = 'succeeded' where id = %s", [tenant.job_id])
        admin.execute(
            "insert into public.jobs (id, tenant_id, conversation_id, kind, status) "
            "values (%s, %s, %s, 'forecast', 'running')",
            [second_job, tenant.id, tenant.conversation_id],
        )
        second_claim = JobClaim(second_job, tenant.id, tenant.conversation_id, "forecast", {}, 1)

        second = repo.publish_run(second_claim, run_result("A1"))

        statuses = {
            r["id"]: r["status"]
            for r in admin.execute(
                "select id, status from public.forecast_runs where tenant_id = %s", [tenant.id]
            )
        }
        assert statuses == {first: "superseded", second: "ready"}

    def test_a_failure_while_publishing_leaves_no_trace(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1", "B2")
        repo = self.repo(engine)
        before = repo.publish_run(claim_for(tenant, "forecast"), run_result("A1"))
        admin.execute("update public.jobs set status = 'succeeded' where id = %s", [tenant.job_id])
        job2 = uuid4()
        admin.execute(
            "insert into public.jobs (id, tenant_id, conversation_id, kind, status) "
            "values (%s, %s, %s, 'forecast', 'running')",
            [job2, tenant.id, tenant.conversation_id],
        )
        broken = RunResult(
            DATA_UNTIL,
            12,
            "weekly",
            {},
            (product_run("A1"), product_run("B2", abc_class="Z")),  # violates the check
        )

        with pytest.raises(Exception, match="abc_class"):
            repo.publish_run(
                JobClaim(job2, tenant.id, tenant.conversation_id, "forecast", {}, 1), broken
            )

        runs = admin.execute(
            "select id, status from public.forecast_runs where tenant_id = %s", [tenant.id]
        ).fetchall()
        assert runs == [{"id": before, "status": "ready"}]
        conversation = admin.execute(
            "select stage, current_run_id from public.conversations where id = %s",
            [tenant.conversation_id],
        ).fetchone()
        assert conversation == {"stage": "ready", "current_run_id": before}

    def test_publishing_logs_a_business_event(
        self, engine: Engine, admin: DictConnection, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1")

        run_id = self.repo(engine).publish_run(claim_for(tenant, "forecast"), run_result("A1"))

        event = admin.execute(
            "select action, target_type, target_id, metadata from audit.events "
            "where tenant_id = %s order by id desc limit 1",
            [tenant.id],
        ).fetchone()
        assert event == {
            "action": "run.created",
            "target_type": "run",
            "target_id": str(run_id),
            "metadata": {"products": 1, "forecast_rows": 12},
        }

    def test_a_job_that_already_published_is_recognised(
        self, engine: Engine, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1")
        repo = self.repo(engine)
        claim = claim_for(tenant, "forecast")
        assert not repo.run_exists_for_job(claim)

        repo.publish_run(claim, run_result("A1"))

        assert repo.run_exists_for_job(claim)

    def test_stored_demand_comes_back_with_the_stock_of_the_last_run(
        self, engine: Engine, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1")
        repo = self.repo(engine)
        repo.publish_run(claim_for(tenant, "forecast"), run_result("A1"))

        [loaded] = repo.load_demand(claim_for(tenant, "forecast"))

        assert (loaded.code, loaded.uom, len(loaded.points)) == ("A1", "kg", 20)
        assert loaded.current_stock == 250.0
        assert repo.run_params(claim_for(tenant, "forecast")) == {
            "lead_time_days": 14,
            "stock_known": True,
        }

    def test_unknown_stock_stays_unknown_after_a_recalculation(
        self, engine: Engine, tenant: Tenant
    ) -> None:
        seed_demand(engine, tenant, "A1")
        repo = self.repo(engine)
        unknown = RunResult(
            DATA_UNTIL,
            12,
            "weekly",
            {"stock_known": False},
            (product_run("A1", current_stock=0.0),),
        )
        repo.publish_run(claim_for(tenant, "forecast"), unknown)

        [loaded] = repo.load_demand(claim_for(tenant, "forecast"))

        assert loaded.current_stock is None


def test_json_documents_are_plain_json(tenant: Tenant) -> None:
    assert json.loads(json.dumps(DOCUMENT.to_dict())) == DOCUMENT.to_dict()
    assert isinstance(tenant.id, UUID)


class TestJobsAndRunsTogether:
    def test_the_claim_carries_the_tenant_every_query_uses(
        self, engine: Engine, tenant: Tenant
    ) -> None:
        claim = SqlJobRepository(engine, stale_after=timedelta(minutes=10), max_attempts=3).claim(
            tenant.job_id
        )

        assert claim is not None
        assert SqlDigestRepository(engine).load_upload(claim) == upload_info(tenant)
