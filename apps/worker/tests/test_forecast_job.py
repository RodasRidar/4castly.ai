"""The forecast job: confirmed plan -> clean -> forecast -> formulas -> published run."""

from __future__ import annotations

import shutil
from datetime import date, timedelta
from pathlib import Path

import pytest

from worker.adapters.ingestion.inspector import SheetsInspector
from worker.adapters.ingestion.kardex_excel import KardexExcelSource
from worker.adapters.ingestion.plan_matcher import DeterministicPlanProposer
from worker.adapters.ingestion.tabular import TabularSalesReader
from worker.adapters.storage.local import LocalFileStore
from worker.application.demand import NotEnoughDataError
from worker.application.forecast import ForecastJob
from worker.application.jobs import JobContext, JobOutcome
from worker.domain.documents import PlanDocument
from worker.domain.errors import JobCancelledError, PermanentJobError
from worker.domain.models import DemandSeries, Forecast
from worker.domain.results import DemandPoint, ProductDemand, ProductOverride

from . import files
from .fakes import FakeJobs, FakeRunRepo, make_claim, make_upload


class ConstantForecaster:
    """Predicts the mean of the last four weeks: fast and deterministic."""

    name = "constant"

    def forecast(self, series: DemandSeries, horizon: int) -> Forecast:
        mean = sum(series.y[-4:]) / 4
        return Forecast(
            series.sku, self.name, series.future_dates(horizon),
            [mean * 0.8] * horizon, [mean] * horizon, [mean * 1.2] * horizon,
        )  # fmt: skip


def confirmed_document(tmp_path: Path, file: Path) -> tuple:
    """Digest the file with the real adapters so the document is what production would store."""
    inspection = SheetsInspector().inspect(file, file.name)
    if inspection.profile.source_kind == "kardex":
        document = PlanDocument("kardex")
    else:
        sheet = next(s for s in inspection.profile.sheets if s.name == inspection.selected_sheet)
        document = PlanDocument("tabular", plan=DeterministicPlanProposer().propose(sheet).plan)
    store_root = tmp_path / "store"
    (store_root / "t" / "u").mkdir(parents=True, exist_ok=True)
    shutil.copy(file, store_root / "t" / "u" / file.name)
    return (make_upload(file.name), document), store_root


def job_for(repo: FakeRunRepo, store_root: Path) -> ForecastJob:
    return ForecastJob(
        repo,
        LocalFileStore(store_root),
        TabularSalesReader(),
        lambda path: KardexExcelSource(path).read_movements(),
        ConstantForecaster(),
    )


def run(
    tmp_path: Path, file: Path, *, params: dict | None = None, repo: FakeRunRepo | None = None,
    jobs: FakeJobs | None = None,
) -> tuple[JobOutcome, FakeRunRepo, FakeJobs]:  # fmt: skip
    confirmed, root = confirmed_document(tmp_path, file)
    repo = repo or FakeRunRepo()
    repo.confirmed = confirmed
    claim = make_claim("forecast", **(params or {}))
    jobs = jobs or FakeJobs(claim)
    outcome = job_for(repo, root)(JobContext(claim, jobs))
    return outcome, repo, jobs


def sales_with_closing_sunday(tmp_path: Path) -> Path:
    """The synthetic sales file plus a final Sunday so the last week counts as complete."""
    path = files.write_sales_csv(tmp_path / "ventas.csv", decimal=",")
    last = files.FIRST_MONDAY + timedelta(weeks=files.WEEKS - 1, days=6)
    with path.open("ab") as handle:
        handle.write(f"{last.strftime('%d/%m/%Y')};QF-0001;Ácido cítrico;0;kg\n".encode("cp1252"))
    return path


class TestTabularRun:
    def test_publishes_one_product_run_per_product_with_formulas_applied(
        self, tmp_path: Path
    ) -> None:
        outcome, repo, jobs = run(tmp_path, sales_with_closing_sunday(tmp_path))

        assert outcome is JobOutcome.SUCCEEDED
        result = repo.published
        assert result is not None
        assert {p.code for p in result.products} == {"QF-0001", "QF-0002", "QF-0003"}
        assert result.horizon_weeks == 12
        assert result.granularity == "weekly"
        first = next(p for p in result.products if p.code == "QF-0001")
        assert len(first.forecast_dates) == 12
        assert first.forecast_dates[0] == result.data_until + timedelta(days=1)
        assert first.analysis.lead_time_weeks == 5  # the 30-day default
        assert first.method == "model"  # 12 clean weeks are enough for the model
        assert first.forecaster == "constant"
        assert jobs.stages[:2] == ["cleaning_data", "calculating_forecast"]
        assert repo.stages[0] == "calculating"

    def test_demand_is_persisted_before_forecasting(self, tmp_path: Path) -> None:
        _, repo, _ = run(tmp_path, sales_with_closing_sunday(tmp_path))

        assert {p.code for p in repo.saved_demand} == {"QF-0001", "QF-0002", "QF-0003"}
        assert all(len(p.points) == files.WEEKS for p in repo.saved_demand)

    def test_without_a_stock_column_stock_is_flagged_unknown(self, tmp_path: Path) -> None:
        _, repo, _ = run(tmp_path, sales_with_closing_sunday(tmp_path))

        assert repo.published.params["stock_known"] is False
        assert "stockout_censoring" in repo.published.params["defaults_used"]

    def test_with_a_stock_column_stock_is_known(self, tmp_path: Path) -> None:
        path = files.write_sales_xlsx(tmp_path / "v.xlsx")

        _, repo, _ = run(tmp_path, path, params={"lead_time_days": 14, "target_coverage_weeks": 6})

        params = repo.published.params
        assert params["stock_known"] is True
        assert params["lead_time_days"] == 14
        assert params["target_coverage_weeks"] == 6
        assert params["defaults_used"] == []
        assert all(p.current_stock >= 0 for p in repo.published.products)

    def test_skipped_questions_record_which_defaults_were_used(self, tmp_path: Path) -> None:
        _, repo, _ = run(tmp_path, sales_with_closing_sunday(tmp_path), params={"skip": True})

        assert set(repo.published.params["defaults_used"]) >= {"lead_time", "target_coverage"}

    def test_abc_classes_are_computed_within_each_unit_of_measure(self, tmp_path: Path) -> None:
        _, repo, _ = run(tmp_path, sales_with_closing_sunday(tmp_path))

        assert {p.code: p.abc_class for p in repo.published.products} == {
            "QF-0001": "A",
            "QF-0002": "A",
            "QF-0003": "A",
        }  # one product per unit: each is the largest of its own unit

    def test_overrides_win_over_the_run_parameters(self, tmp_path: Path) -> None:
        repo = FakeRunRepo(
            overrides={"QF-0001": ProductOverride(lead_time_days=45, on_order_qty=500.0)}
        )

        _, repo, _ = run(tmp_path, sales_with_closing_sunday(tmp_path), repo=repo)

        by_code = {p.code: p for p in repo.published.products}
        assert by_code["QF-0001"].lead_time_days == 45
        assert by_code["QF-0001"].lead_time_overridden
        assert by_code["QF-0001"].on_order_qty == 500.0
        assert by_code["QF-0002"].lead_time_days == 30
        assert not by_code["QF-0002"].lead_time_overridden

    def test_stage_progress_counts_products(self, tmp_path: Path) -> None:
        _, _, jobs = run(tmp_path, sales_with_closing_sunday(tmp_path))

        assert (3, 3) in jobs.progress
        assert "calculating_forecast" in jobs.stages


class TestKardexRun:
    def test_a_kardex_goes_end_to_end(self, tmp_path: Path, kardex_path: Path) -> None:
        outcome, repo, _ = run(tmp_path, kardex_path)

        assert outcome is JobOutcome.SUCCEEDED
        result = repo.published
        assert {p.code for p in result.products} == {"A001", "B002"}
        assert result.params["stock_known"] is True
        assert result.data_until == date(2025, 1, 5)
        assert {p.code: p.current_stock for p in result.products} == {"A001": 100.0, "B002": 40.0}


class TestRecalculation:
    def test_reuses_the_stored_demand_and_the_previous_parameters(self, tmp_path: Path) -> None:
        start = date(2025, 1, 6)
        points = tuple(DemandPoint(start + timedelta(weeks=i), 10.0 + i, False) for i in range(30))
        repo = FakeRunRepo(
            stored_demand=[ProductDemand("A1", "Producto", "kg", points, 80.0)],
            previous_params={
                "horizon_weeks": 12,
                "lead_time_days": 21,
                "target_coverage_weeks": 4,
                "stock_known": True,
                "data_until": "2025-08-03",
            },
        )
        claim = make_claim("forecast", recalculate=True, target_coverage_weeks=8)
        jobs = FakeJobs(claim)
        job = job_for(repo, tmp_path)  # the store is never touched

        outcome = job(JobContext(claim, jobs))

        assert outcome is JobOutcome.SUCCEEDED
        result = repo.published
        assert result.data_until == date(2025, 8, 3)
        [product] = result.products
        assert (product.lead_time_days, product.target_coverage_weeks) == (21, 8)
        assert product.current_stock == 80.0
        assert repo.saved_demand == []  # nothing re-parsed, nothing rewritten

    def test_recalculating_without_a_previous_run_is_a_permanent_error(
        self, tmp_path: Path
    ) -> None:
        claim = make_claim("forecast", recalculate=True)

        with pytest.raises(PermanentJobError):
            job_for(FakeRunRepo(), tmp_path)(JobContext(claim, FakeJobs(claim)))


class TestGuards:
    def test_a_job_that_already_published_does_no_work(self, tmp_path: Path) -> None:
        repo = FakeRunRepo(exists=True)
        claim = make_claim("forecast")

        outcome = job_for(repo, tmp_path)(JobContext(claim, FakeJobs(claim)))

        assert outcome is JobOutcome.SUCCEEDED
        assert repo.published is None
        assert repo.stages == []

    def test_an_unconfirmed_plan_is_a_permanent_error(self, tmp_path: Path) -> None:
        claim = make_claim("forecast")

        with pytest.raises(PermanentJobError, match="confirmed"):
            job_for(FakeRunRepo(confirmed=None), tmp_path)(JobContext(claim, FakeJobs(claim)))

    def test_a_file_with_no_complete_week_is_not_enough_data(self, tmp_path: Path) -> None:
        path = tmp_path / "corto.csv"
        path.write_text("Fecha,Codigo,Cantidad\n2026-01-05,A1,5\n2026-01-06,A1,6\n")

        with pytest.raises(NotEnoughDataError):
            run(tmp_path, path)

    def test_cancellation_mid_run_publishes_nothing(self, tmp_path: Path) -> None:
        claim = make_claim("forecast")
        jobs = FakeJobs(claim, cancel_after_stages=2)

        with pytest.raises(JobCancelledError):
            run(tmp_path, sales_with_closing_sunday(tmp_path), jobs=jobs)

    def test_a_plan_without_a_date_cannot_be_executed(self, tmp_path: Path) -> None:
        confirmed, root = confirmed_document(tmp_path, sales_with_closing_sunday(tmp_path))
        repo = FakeRunRepo(confirmed=(confirmed[0], PlanDocument("tabular", plan=None)))
        claim = make_claim("forecast")

        with pytest.raises(PermanentJobError, match="plan"):
            job_for(repo, root)(JobContext(claim, FakeJobs(claim)))
