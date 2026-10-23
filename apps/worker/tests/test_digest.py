"""The digest job: open the file, identify the format and columns, propose and summarise."""

from __future__ import annotations

import shutil
from datetime import date
from pathlib import Path

import pytest

from worker.adapters.ingestion.inspector import SheetsInspector
from worker.adapters.ingestion.kardex_scan import KardexScanner
from worker.adapters.ingestion.plan_matcher import DeterministicPlanProposer
from worker.adapters.ingestion.tabular import TabularSalesReader
from worker.adapters.storage.local import LocalFileStore
from worker.application.digest import DigestJob
from worker.application.jobs import JobContext, JobOutcome
from worker.domain.documents import ColumnRef, NormalizationPlan, Proposal, QuantityMapping
from worker.domain.errors import JobCancelledError, PermanentJobError
from worker.domain.jobs import JobClaim

from . import files
from .fakes import FakeDigestRepo, FakeJobs, make_claim, make_upload


def digest(tmp_path: Path, file: Path, proposer=None, *, jobs: FakeJobs | None = None):
    """Run a digest over `file`; returns (outcome, repo, jobs)."""
    store_root = tmp_path / "store"
    (store_root / "t" / "u").mkdir(parents=True, exist_ok=True)
    shutil.copy(file, store_root / "t" / "u" / file.name)
    claim = make_claim()
    repo = FakeDigestRepo(upload=make_upload(file.name))
    jobs = jobs or FakeJobs(claim)
    job = DigestJob(
        repo,
        LocalFileStore(store_root),
        SheetsInspector(),
        proposer or DeterministicPlanProposer(),
        TabularSalesReader(),
        KardexScanner(),
    )
    outcome = job(JobContext(claim, jobs))
    return outcome, repo, jobs


class TestTabular:
    def test_a_csv_is_profiled_mapped_and_summarised_for_confirmation(self, tmp_path: Path) -> None:
        outcome, repo, jobs = digest(tmp_path, files.write_sales_csv(tmp_path / "ventas.csv"))

        assert outcome is JobOutcome.SUCCEEDED
        assert jobs.stages == ["reading_file", "identifying_columns"]
        assert repo.stages == ["digesting", "awaiting_confirmation"]
        saved = repo.saved
        assert saved is not None
        document = saved["document"]
        assert document.source_kind == "tabular"
        assert document.plan is not None
        assert document.plan.quantity.decimal_separator == ","
        summary = document.summary
        assert summary is not None
        assert summary.products_found == 3
        assert summary.date_from == date(2026, 1, 5)
        assert summary.date_to == date(2026, 3, 23)
        assert summary.history_weeks == 12
        assert summary.rows_dropped == 3
        assert {w.code: w.count for w in document.warnings} == {
            "dropped_rows": 3,
            "missing_stock": None,
            "mixed_units": None,
        }
        assert saved["profile"].date_from == date(2026, 1, 5)
        assert saved["selected_sheet"] == "CSV"
        assert saved["proposed_by"] == "rules"

    def test_a_workbook_with_stock_has_no_missing_stock_warning(self, tmp_path: Path) -> None:
        _, repo, _ = digest(tmp_path, files.write_sales_xlsx(tmp_path / "ventas.xlsx"))

        assert repo.saved is not None
        codes = {w.code for w in repo.saved["document"].warnings}
        assert "missing_stock" not in codes
        assert repo.saved["selected_sheet"] == "Ventas"

    def test_short_history_products_are_counted(self, tmp_path: Path) -> None:
        path = tmp_path / "corto.csv"
        lines = ["Fecha,Codigo,Cantidad"]
        lines += [f"2026-01-{d:02d},LARGO,5" for d in (5, 12, 19, 26)]
        lines += [f"2026-0{m}-{d:02d},LARGO,5" for m in (2, 3, 4) for d in (2, 9, 16, 23)]
        lines += ["2026-04-20,NUEVO,3", "2026-04-27,NUEVO,4"]
        path.write_text("\n".join(lines) + "\n")

        _, repo, _ = digest(tmp_path, path)

        assert repo.saved is not None
        counts = {w.code: w.count for w in repo.saved["document"].warnings}
        assert counts["short_history"] == 1

    def test_a_file_without_a_date_column_asks_for_one(self, tmp_path: Path) -> None:
        path = tmp_path / "sin_fecha.csv"
        path.write_text("Periodo,Codigo,Cantidad\n2026-01,A1,5\n2026-02,A1,6\n2026-03,A1,7\n")

        _, repo, _ = digest(tmp_path, path)

        assert repo.stages[-1] == "needs_date_column"
        assert repo.saved is not None
        document = repo.saved["document"]
        assert document.needs_date_column
        assert document.plan is None
        assert [c.column for c in document.date_column_candidates] == ["Periodo"]

    def test_missing_required_columns_still_reach_the_confirmation_screen(
        self, tmp_path: Path
    ) -> None:
        path = tmp_path / "raro.csv"
        path.write_text("Fecha,Notas\n12/01/2026,hola\n13/01/2026,adios\n")

        _, repo, _ = digest(tmp_path, path)

        assert repo.stages[-1] == "awaiting_confirmation"
        assert repo.saved is not None
        assert set(repo.saved["document"].unmapped_required) == {"product_code", "quantity"}

    def test_the_proposer_that_answered_is_recorded(self, tmp_path: Path) -> None:
        class Llm:
            def propose(self, sheet):
                plan = DeterministicPlanProposer().propose(sheet).plan
                return Proposal(plan, proposed_by="llm")

        _, repo, _ = digest(tmp_path, files.write_sales_csv(tmp_path / "v.csv"), Llm())

        assert repo.saved is not None
        assert repo.saved["proposed_by"] == "llm"

    def test_a_plan_that_cannot_run_still_goes_to_confirmation_without_a_summary(
        self, tmp_path: Path
    ) -> None:
        bad = NormalizationPlan(
            "CSV", 1, None, ColumnRef("Cod Art"), None, QuantityMapping("No existe")
        )

        class Broken:
            def propose(self, sheet):
                good = DeterministicPlanProposer().propose(sheet).plan
                assert good is not None
                return Proposal(
                    NormalizationPlan(
                        good.sheet,
                        good.header_row,
                        good.date,
                        good.product_code,
                        None,
                        bad.quantity,
                    )
                )

        outcome, repo, _ = digest(tmp_path, files.write_sales_csv(tmp_path / "v.csv"), Broken())

        assert outcome is JobOutcome.SUCCEEDED
        assert repo.saved is not None
        assert repo.saved["document"].summary is None
        assert repo.stages[-1] == "awaiting_confirmation"


class TestKardex:
    def test_a_kardex_is_summarised_with_its_movement_rules(
        self, tmp_path: Path, kardex_path: Path
    ) -> None:
        outcome, repo, _ = digest(tmp_path, kardex_path)

        assert outcome is JobOutcome.SUCCEEDED
        assert repo.stages == ["digesting", "awaiting_confirmation"]
        saved = repo.saved
        assert saved is not None
        document = saved["document"]
        assert document.source_kind == "kardex"
        assert document.plan is None
        treatments = {r.code: r.treatment for r in document.movement_rules}
        assert treatments == {
            "01": "demand",
            "05": "return",
            "02": "excluded",
            "11": "excluded",
            "99": "excluded",
        }
        assert document.summary is not None
        assert document.summary.products_found == 2
        assert document.summary.date_from == date(2025, 1, 1)
        assert document.summary.date_to == date(2025, 1, 8)
        assert {w.code for w in document.warnings} == {"short_history"}
        assert saved["profile"].source_kind == "kardex"
        assert saved["proposed_by"] == "rules"


class TestFailures:
    def test_an_unreadable_file_is_reported_to_the_user_and_ends_the_job(
        self, tmp_path: Path
    ) -> None:
        outcome, repo, _ = digest(tmp_path, files.write_encrypted_looking(tmp_path / "a.xlsx"))

        assert outcome is JobOutcome.FAILED_HANDLED
        assert repo.unreadable == "password_protected"
        assert repo.saved is None

    def test_an_oversized_object_is_reported_as_too_large(self, tmp_path: Path) -> None:
        from worker.adapters.storage.supabase import FileTooLargeError  # noqa: PLC0415

        class Huge:
            def fetch(self, storage_path: str, dest_dir: Path) -> Path:
                raise FileTooLargeError

        claim = make_claim()
        repo = FakeDigestRepo(upload=make_upload("x.xlsx"))
        job = DigestJob(
            repo,
            Huge(),
            SheetsInspector(),
            DeterministicPlanProposer(),
            TabularSalesReader(),
            KardexScanner(),
        )

        outcome = job(JobContext(claim, FakeJobs(claim)))

        assert outcome is JobOutcome.FAILED_HANDLED
        assert repo.unreadable == "too_large"

    def test_a_job_without_an_upload_is_a_permanent_error(self, tmp_path: Path) -> None:
        claim = make_claim()
        job = DigestJob(
            FakeDigestRepo(upload=None),
            SimpleNamespace(),
            SheetsInspector(),
            DeterministicPlanProposer(),
            TabularSalesReader(),
            KardexScanner(),
        )

        with pytest.raises(PermanentJobError):
            job(JobContext(claim, FakeJobs(claim)))

    def test_a_missing_object_is_a_permanent_error(self, tmp_path: Path) -> None:
        claim = make_claim()
        repo = FakeDigestRepo(upload=make_upload("gone.xlsx"))
        job = DigestJob(
            repo,
            LocalFileStore(tmp_path),
            SheetsInspector(),
            DeterministicPlanProposer(),
            TabularSalesReader(),
            KardexScanner(),
        )

        with pytest.raises(PermanentJobError):
            job(JobContext(claim, FakeJobs(claim)))

    def test_cancellation_is_honoured_between_stages(self, tmp_path: Path) -> None:
        file = files.write_sales_csv(tmp_path / "v.csv")

        with pytest.raises(JobCancelledError):
            digest(tmp_path, file, jobs=FakeJobs(make_claim(), cancel_after_stages=1))


def test_claim_type_is_the_domain_claim() -> None:
    assert isinstance(make_claim(), JobClaim)
