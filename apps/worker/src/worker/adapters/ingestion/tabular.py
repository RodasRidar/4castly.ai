"""Executes a normalization plan on the full file (plan 6c, executor rules)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import polars as pl

from worker.adapters.ingestion import sheets
from worker.adapters.ingestion.inspector import normalize
from worker.adapters.ingestion.parsing import parse_date, parse_decimal
from worker.domain.documents import NormalizationPlan
from worker.ports.sales_reader import SalesRead

SALES_SCHEMA = {
    "sku": pl.Utf8,
    "sku_name": pl.Utf8,
    "uom": pl.Utf8,
    "ds": pl.Date,
    "qty": pl.Float64,
    "stock": pl.Float64,
}


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _index(headers: list[str], column: str) -> int:
    wanted = normalize(column)
    for i, header in enumerate(headers):
        if header == column or normalize(header) == wanted:
            return i
    message = f"column {column!r} not found in the sheet header"
    raise ValueError(message)


class TabularSalesReader:
    """`SalesReader` adapter for .xlsx and .csv files."""

    def read(self, path: Path, file_name: str, plan: NormalizationPlan) -> SalesRead:
        if plan.date is None:
            message = "the plan has no date column"
            raise ValueError(message)
        kind = sheets.check_container(path, Path(file_name).suffix)
        rows = sheets.read_rows(path, kind, plan.sheet)
        headers: list[str] = []
        for number, row in enumerate(rows, start=1):
            if number == plan.header_row:
                headers = [_text(c) for c in row]
                break
        if not headers:
            message = "column header row not found"
            raise ValueError(message)

        i_date = _index(headers, plan.date.column)
        i_code = _index(headers, plan.product_code.column)
        i_qty = _index(headers, plan.quantity.column)
        i_name = _index(headers, plan.product_name.column) if plan.product_name else None
        i_stock = _index(headers, plan.stock.column) if plan.stock else None
        i_unit = _index(headers, plan.unit.column) if plan.unit.column else None

        def cell(row: tuple[Any, ...], index: int | None) -> Any:
            return row[index] if index is not None and index < len(row) else None

        records: list[tuple[Any, ...]] = []
        read = dropped = 0
        for row in rows:
            if all(c is None or _text(c) == "" for c in row):
                continue
            read += 1
            day = parse_date(cell(row, i_date), plan.date.format)
            code = _text(cell(row, i_code))
            qty = parse_decimal(cell(row, i_qty), plan.quantity.decimal_separator)
            if day is None or not code or qty is None:
                dropped += 1
                continue
            stock = (
                parse_decimal(cell(row, i_stock), plan.stock.decimal_separator)
                if plan.stock
                else None
            )
            name = _text(cell(row, i_name)) or code
            unit = _text(cell(row, i_unit)) or plan.unit.default
            records.append((code, name, unit, day, qty, stock))

        frame = pl.DataFrame(records, schema=SALES_SCHEMA, orient="row")
        return SalesRead(frame, read, dropped)
