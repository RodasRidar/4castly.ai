"""Opening, profiling, matching and executing uploaded files."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from worker.adapters.ingestion import sheets
from worker.adapters.ingestion.inspector import SheetsInspector
from worker.adapters.ingestion.plan_matcher import DeterministicPlanProposer
from worker.adapters.ingestion.tabular import TabularSalesReader
from worker.domain.documents import (
    ColumnRef,
    DateMapping,
    NormalizationPlan,
    QuantityMapping,
    UnitMapping,
)
from worker.domain.errors import UnreadableFileError

from . import files


class TestContainerChecks:
    def test_encrypted_workbook_is_password_protected(self, tmp_path: Path) -> None:
        path = files.write_encrypted_looking(tmp_path / "a.xlsx")

        with pytest.raises(UnreadableFileError) as raised:
            sheets.check_container(path)

        assert raised.value.code == "password_protected"

    @pytest.mark.parametrize(
        ("name", "writer", "code"),
        [
            ("legacy.xls", files.write_encrypted_looking, "unsupported_format"),
            ("broken.xlsx", files.write_zip_without_workbook, "corrupt"),
            ("macro.xlsx", files.write_macro_zip, "unsupported_format"),
            ("macro.xlsm", files.write_macro_zip, "unsupported_format"),
        ],
    )
    def test_unusable_containers(self, tmp_path: Path, name: str, writer, code: str) -> None:
        path = writer(tmp_path / name)

        with pytest.raises(UnreadableFileError) as raised:
            sheets.check_container(path)

        assert raised.value.code == code

    def test_not_a_zip_is_corrupt(self, tmp_path: Path) -> None:
        path = tmp_path / "junk.xlsx"
        path.write_bytes(b"this is not a zip file at all")

        with pytest.raises(UnreadableFileError) as raised:
            sheets.check_container(path)

        assert raised.value.code == "corrupt"

    def test_empty_and_binary_and_unknown_files(self, tmp_path: Path) -> None:
        empty = tmp_path / "empty.csv"
        empty.write_bytes(b"")
        binary = tmp_path / "bin.csv"
        binary.write_bytes(b"a,b\x00\x01\x02")
        other = tmp_path / "doc.pdf"
        other.write_bytes(b"%PDF-1.7")

        codes = []
        for path in (empty, binary, other):
            with pytest.raises(UnreadableFileError) as raised:
                sheets.check_container(path)
            codes.append(raised.value.code)

        assert codes == ["empty", "corrupt", "unsupported_format"]

    def test_decompression_bombs_are_refused(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = files.write_sales_xlsx(tmp_path / "ok.xlsx")
        monkeypatch.setattr(sheets, "MAX_UNCOMPRESSED_BYTES", 100)

        with pytest.raises(UnreadableFileError, match="size"):
            sheets.check_container(path)

    def test_a_good_workbook_and_csv_pass(self, tmp_path: Path) -> None:
        assert sheets.check_container(files.write_sales_xlsx(tmp_path / "a.xlsx")) == "xlsx"
        assert sheets.check_container(files.write_sales_csv(tmp_path / "a.csv")) == "csv"


class TestInspector:
    def test_csv_is_decoded_sniffed_and_profiled(self, tmp_path: Path) -> None:
        path = files.write_sales_csv(tmp_path / "ventas.csv")

        inspection = SheetsInspector().inspect(path, "ventas.csv")

        assert inspection.profile.source_kind == "tabular"
        [sheet] = inspection.profile.sheets
        assert sheet.name == "CSV"
        assert [c.name for c in sheet.columns] == [
            "Fecha Doc",
            "Cod Art",
            "Artículo",
            "Cant",
            "Unidad",
        ]
        by_name = {c.name: c for c in sheet.columns}
        assert by_name["Fecha Doc"].inferred_type == "date"
        assert by_name["Cant"].inferred_type == "number"
        assert by_name["Artículo"].inferred_type == "text"
        assert len(by_name["Cod Art"].samples) == 5
        assert inspection.selected_sheet == "CSV"

    def test_xlsx_finds_the_header_below_title_rows_and_picks_the_biggest_sheet(
        self, tmp_path: Path
    ) -> None:
        path = files.write_sales_xlsx(tmp_path / "ventas.xlsx", title_rows=3)

        inspection = SheetsInspector().inspect(path, "ventas.xlsx")

        assert inspection.selected_sheet == "Ventas"
        sheet = next(s for s in inspection.profile.sheets if s.name == "Ventas")
        assert sheet.header_row == 4
        assert sheet.row_count == len(files.sales_rows())
        assert {c.name for c in sheet.columns} >= {"Fecha", "Código", "Cantidad", "Stock"}

    def test_a_kardex_is_detected_by_its_signature(self, kardex_path: Path) -> None:
        inspection = SheetsInspector().inspect(kardex_path, "kardex.xlsx")

        assert inspection.profile.source_kind == "kardex"

    def test_unreadable_files_raise(self, tmp_path: Path) -> None:
        with pytest.raises(UnreadableFileError):
            SheetsInspector().inspect(files.write_encrypted_looking(tmp_path / "x.xlsx"), "x.xlsx")


class TestDeterministicMatcher:
    def propose(self, path: Path, name: str):
        inspection = SheetsInspector().inspect(path, name)
        sheet = next(s for s in inspection.profile.sheets if s.name == inspection.selected_sheet)
        return DeterministicPlanProposer().propose(sheet)

    def test_maps_spanish_erp_columns_and_detects_formats(self, tmp_path: Path) -> None:
        proposal = self.propose(files.write_sales_csv(tmp_path / "v.csv"), "v.csv")

        plan = proposal.plan
        assert plan is not None
        assert plan.date == DateMapping("Fecha Doc", "dd/mm/yyyy")
        assert plan.product_code == ColumnRef("Cod Art")
        assert plan.product_name == ColumnRef("Artículo")
        assert plan.quantity == QuantityMapping("Cant", ",")
        assert plan.stock is None
        assert plan.unit.column == "Unidad"
        assert proposal.unmapped_required == ()
        assert not proposal.needs_date_column

    def test_maps_accented_headers_native_dates_and_a_stock_column(self, tmp_path: Path) -> None:
        proposal = self.propose(files.write_sales_xlsx(tmp_path / "v.xlsx"), "v.xlsx")

        plan = proposal.plan
        assert plan is not None
        assert plan.sheet == "Ventas"
        assert plan.header_row == 3
        assert plan.date == DateMapping("Fecha", "yyyy-mm-dd")
        assert plan.product_code == ColumnRef("Código")
        assert plan.product_name == ColumnRef("Descripción")
        assert plan.quantity.column == "Cantidad"
        assert plan.stock is not None
        assert plan.stock.column == "Stock"

    def test_counterparty_columns_are_never_mapped(self, tmp_path: Path) -> None:
        path = tmp_path / "c.csv"
        path.write_text(
            "Fecha,Cliente,Código,Cantidad\n12/01/2026,Acme SAC,A1,5\n13/01/2026,Beta SAC,A1,6\n",
            encoding="utf-8",
        )

        plan = self.propose(path, "c.csv").plan

        assert plan is not None
        assert plan.product_name is None
        assert plan.unit.column is None

    def test_without_a_date_column_the_proposal_asks_for_one(self, tmp_path: Path) -> None:
        path = tmp_path / "n.csv"
        path.write_text(
            "Periodo,Codigo,Cantidad\n2026-01,A1,5\n2026-02,A1,6\n2026-03,A1,7\n", encoding="utf-8"
        )

        proposal = self.propose(path, "n.csv")

        assert proposal.plan is None
        assert proposal.needs_date_column
        assert [c.column for c in proposal.date_column_candidates] == ["Periodo"]

    def test_missing_required_columns_are_reported(self, tmp_path: Path) -> None:
        path = tmp_path / "m.csv"
        path.write_text("Fecha,Notas\n12/01/2026,hola\n13/01/2026,adios\n", encoding="utf-8")

        proposal = self.propose(path, "m.csv")

        assert proposal.plan is None
        assert set(proposal.unmapped_required) == {"product_code", "quantity"}


class TestTabularReader:
    def plan(self, **overrides: object) -> NormalizationPlan:
        base = {
            "sheet": "CSV",
            "header_row": 1,
            "date": DateMapping("Fecha Doc", "dd/mm/yyyy"),
            "product_code": ColumnRef("Cod Art"),
            "product_name": ColumnRef("Artículo"),
            "quantity": QuantityMapping("Cant", ","),
            "unit": UnitMapping("Unidad", "u"),
        }
        return NormalizationPlan(**{**base, **overrides})  # ty: ignore[invalid-argument-type]

    def test_executes_the_plan_and_counts_what_it_drops(self, tmp_path: Path) -> None:
        path = files.write_sales_csv(tmp_path / "v.csv")

        result = TabularSalesReader().read(path, "v.csv", self.plan())

        assert result.rows_dropped == 3  # no date, no code, unparseable quantity
        assert result.rows_read == len(files.sales_rows()) + 3
        frame = result.frame
        assert frame.columns == ["sku", "sku_name", "uom", "ds", "qty", "stock"]
        assert frame.height == len(files.sales_rows())
        assert frame["ds"].min() == date(2026, 1, 5)
        assert frame.filter(frame["qty"] < 0).height == 1  # the return keeps its sign
        assert set(frame["uom"].unique()) == {"kg", "L", "u"}

    def test_decimal_commas_follow_the_declared_separator(self, tmp_path: Path) -> None:
        path = files.write_sales_csv(tmp_path / "v.csv")

        frame = TabularSalesReader().read(path, "v.csv", self.plan()).frame

        first = frame.filter((frame["sku"] == "QF-0001") & (frame["ds"] == date(2026, 1, 5)))
        assert first["qty"].to_list() == [100.0]

    def test_xlsx_with_native_values_and_a_stock_column(self, tmp_path: Path) -> None:
        path = files.write_sales_xlsx(tmp_path / "v.xlsx")
        plan = self.plan(
            sheet="Ventas",
            header_row=3,
            date=DateMapping("Fecha", "yyyy-mm-dd"),
            product_code=ColumnRef("Código"),
            product_name=ColumnRef("Descripción"),
            quantity=QuantityMapping("Cantidad", "."),
            stock=QuantityMapping("Stock", "."),
            unit=UnitMapping("UM", "u"),
        )

        result = TabularSalesReader().read(path, "v.xlsx", plan)

        assert result.rows_dropped == 0
        assert result.frame["stock"].null_count() == 0
        assert result.frame.height == len(files.sales_rows())

    def test_a_plan_without_a_date_cannot_be_executed(self, tmp_path: Path) -> None:
        path = files.write_sales_csv(tmp_path / "v.csv")

        with pytest.raises(ValueError, match="date"):
            TabularSalesReader().read(path, "v.csv", self.plan(date=None))

    def test_a_plan_pointing_at_a_missing_column_fails_loudly(self, tmp_path: Path) -> None:
        path = files.write_sales_csv(tmp_path / "v.csv")

        with pytest.raises(ValueError, match="column"):
            TabularSalesReader().read(
                path, "v.csv", self.plan(quantity=QuantityMapping("Nope", ","))
            )
