"""The digest job (plan 6c): open the file, identify format and columns, propose, summarise.

It never cleans or forecasts: that happens after the user confirms the mapping.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory

import polars as pl

from worker.application.jobs import JobContext, JobOutcome
from worker.domain.documents import (
    SOURCE_KARDEX,
    SOURCE_TABULAR,
    DataSummary,
    DataWarning,
    FileProfile,
    Inspection,
    MovementRule,
    NormalizationPlan,
    PlanDocument,
    Proposal,
)
from worker.domain.errors import PermanentJobError, UnreadableFileError
from worker.domain.jobs import STAGE_IDENTIFYING_COLUMNS, STAGE_READING_FILE
from worker.ports.file_inspector import FileInspector
from worker.ports.file_store import FileStore
from worker.ports.kardex_scanner import KardexScanner
from worker.ports.plan_proposer import PlanProposer
from worker.ports.run_repository import DigestRepository
from worker.ports.sales_reader import SalesReader

MIN_HISTORY_WEEKS = 8

# What counts as demand in a Kardex: sales minus customer returns (plan 6c).
KARDEX_RULES = (
    MovementRule("01", "Venta", "demand"),
    MovementRule("05", "Devolución de cliente", "return"),
    MovementRule("02", "Importación", "excluded"),
    MovementRule("11", "Transferencia", "excluded"),
    MovementRule("99", "Ajuste", "excluded"),
)


def _summary(frame: pl.DataFrame, rows_read: int, rows_dropped: int) -> DataSummary:
    if frame.is_empty():
        return DataSummary(0, None, None, 0, rows_read, rows_dropped)
    first, last = frame.select(
        pl.col("ds").min().alias("first"), pl.col("ds").max().alias("last")
    ).row(0)
    return DataSummary(
        products_found=frame["sku"].n_unique(),
        date_from=first,
        date_to=last,
        history_weeks=(last - first).days // 7 + 1,
        rows_read=rows_read,
        rows_dropped=rows_dropped,
    )


def _short_history(frame: pl.DataFrame) -> int:
    if frame.is_empty():
        return 0
    spans = frame.group_by("sku").agg(
        ((pl.col("ds").max() - pl.col("ds").min()).dt.total_days() // 7 + 1).alias("weeks")
    )
    return int((spans["weeks"] < MIN_HISTORY_WEEKS).sum())


class DigestJob:
    """Handler for `digest` jobs."""

    def __init__(  # noqa: PLR0913, PLR0917 - the ports the digest depends on
        self,
        repo: DigestRepository,
        store: FileStore,
        inspector: FileInspector,
        proposer: PlanProposer,
        sales_reader: SalesReader,
        kardex: KardexScanner,
    ) -> None:
        self._repo = repo
        self._store = store
        self._inspector = inspector
        self._proposer = proposer
        self._sales = sales_reader
        self._kardex = kardex

    def __call__(self, ctx: JobContext) -> JobOutcome:
        claim = ctx.claim
        self._repo.set_conversation_stage(claim, "digesting")
        ctx.stage(STAGE_READING_FILE)
        upload = self._repo.load_upload(claim)
        if upload is None:
            message = "the conversation has no upload"
            raise PermanentJobError(message)
        with TemporaryDirectory(prefix="digest-") as scratch:
            try:
                path = self._store.fetch(upload.storage_path, Path(scratch))
            except FileNotFoundError as error:
                message = "the uploaded object is missing from storage"
                raise PermanentJobError(message) from error
            except Exception as error:
                if type(error).__name__ != "FileTooLargeError":
                    raise
                self._repo.mark_unreadable(claim, upload, "too_large")
                return JobOutcome.FAILED_HANDLED
            try:
                inspection = self._inspector.inspect(path, upload.file_name)
            except UnreadableFileError as error:
                self._repo.mark_unreadable(claim, upload, error.code)
                return JobOutcome.FAILED_HANDLED

            ctx.stage(STAGE_IDENTIFYING_COLUMNS)
            document, proposed_by, profile = self._identify(path, upload.file_name, inspection)

        stage = "needs_date_column" if document.needs_date_column else "awaiting_confirmation"
        self._repo.save_digest(
            claim,
            upload,
            profile=profile,
            selected_sheet=inspection.selected_sheet,
            document=document,
            proposed_by=proposed_by,
            stage=stage,
        )
        return JobOutcome.SUCCEEDED

    def _identify(
        self, path: Path, file_name: str, inspection: Inspection
    ) -> tuple[PlanDocument, str, FileProfile]:
        if inspection.profile.source_kind == SOURCE_KARDEX:
            return self._kardex_document(path, inspection)
        sheet = next(s for s in inspection.profile.sheets if s.name == inspection.selected_sheet)
        proposal = self._proposer.propose(sheet)
        return self._tabular_document(path, file_name, inspection, proposal)

    def _kardex_document(
        self, path: Path, inspection: Inspection
    ) -> tuple[PlanDocument, str, FileProfile]:
        scan = self._kardex.scan(path)
        warnings = (
            (DataWarning("short_history", "warning", scan.short_history_products),)
            if scan.short_history_products
            else ()
        )
        document = PlanDocument(
            SOURCE_KARDEX,
            summary=scan.summary,
            movement_rules=KARDEX_RULES,
            warnings=warnings,
        )
        profile = replace(
            inspection.profile, date_from=scan.summary.date_from, date_to=scan.summary.date_to
        )
        return document, "rules", profile

    def _tabular_document(
        self, path: Path, file_name: str, inspection: Inspection, proposal: Proposal
    ) -> tuple[PlanDocument, str, FileProfile]:
        if proposal.plan is None:
            document = PlanDocument(
                SOURCE_TABULAR,
                unmapped_required=proposal.unmapped_required,
                date_column_candidates=proposal.date_column_candidates,
                needs_date_column=proposal.needs_date_column,
            )
            return document, proposal.proposed_by, inspection.profile
        summary, warnings = self._run_plan(path, file_name, proposal.plan)
        document = PlanDocument(
            SOURCE_TABULAR,
            plan=proposal.plan,
            summary=summary,
            warnings=warnings,
        )
        profile = inspection.profile
        if summary is not None:
            profile = replace(profile, date_from=summary.date_from, date_to=summary.date_to)
        return document, proposal.proposed_by, profile

    def _run_plan(
        self, path: Path, file_name: str, plan: NormalizationPlan
    ) -> tuple[DataSummary | None, tuple[DataWarning, ...]]:
        """Execute the proposed plan on the whole file, only to summarise it for the user."""
        try:
            read = self._sales.read(path, file_name, plan)
        except ValueError:  # a mapping that does not run: the user corrects it on screen
            return None, ()
        summary = _summary(read.frame, read.rows_read, read.rows_dropped)
        short = _short_history(read.frame)
        units = read.frame["uom"].n_unique() if not read.frame.is_empty() else 0
        warnings = [
            DataWarning("short_history", "warning", short) if short else None,
            DataWarning("dropped_rows", "warning", read.rows_dropped)
            if read.rows_dropped
            else None,
            DataWarning("missing_stock", "info") if plan.stock is None else None,
            DataWarning("mixed_units", "info") if units > 1 else None,
        ]
        return summary, tuple(w for w in warnings if w)
