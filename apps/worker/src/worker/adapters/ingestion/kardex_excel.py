"""Parser for the printed "KARDEX DETALLADO DE ARTICULOS" Excel report.

Layout (1-based columns, values read with openpyxl `data_only=True`):

* header rows (company, title, ``ALMACEN: ...``, ``DEL d/mm/yyyy AL d/mm/yyyy``)
* per-article block:
    - a row with ``ARTICULO: <code>`` in column E
    - a two-row table header
    - an item row: code in A, name in B, unit of measure in K
    - movement rows: A = datetime, B = code, C = type text, H = document,
      J = counterparty, M = qty in, N = qty out, O = balance
    - a closing row whose column B starts with ``TOTAL <name>``
* a final ``TOTAL GENERAL`` row
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Sequence
from datetime import date, datetime, time
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from worker.domain.models import OPENING_BALANCE_TYPE, Movement

COL_A, COL_B, COL_C = 0, 1, 2
COL_E, COL_H, COL_J, COL_K = 4, 7, 9, 10
COL_S_INICIAL, COL_INGRESOS, COL_SALIDAS, COL_S_FINAL = 11, 12, 13, 14

_PERIOD_RE = re.compile(r"DEL\s+(\d{1,2}/\d{1,2}/\d{4})\s+AL\s+(\d{1,2}/\d{1,2}/\d{4})", re.I)
_HEADER_LABELS = {"ARTICULO", "FECHA", "CANTIDAD", "COSTO"}


def _cell(row: Sequence[Any], idx: int) -> Any:
    return row[idx] if idx < len(row) else None


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _number(value: Any) -> float | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    return None


def _parse_period_start(rows: Sequence[Sequence[Any]]) -> datetime | None:
    for row in rows[:15]:
        for value in row:
            match = _PERIOD_RE.search(_text(value))
            if match:
                # Kardex dates are naive local business dates by design (no timezone in source).
                return datetime.strptime(match.group(1), "%d/%m/%Y")  # noqa: DTZ007
    return None


class KardexExcelSource:
    """`MovementSource` adapter reading a Kardex report from an .xlsx file."""

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)

    def read_movements(self) -> list[Movement]:
        workbook = load_workbook(self._path, data_only=True, read_only=True)
        try:
            movements: list[Movement] = []
            for sheet in workbook.worksheets:
                rows = [tuple(r) for r in sheet.iter_rows(values_only=True)]
                movements.extend(self._parse_rows(rows))
            return movements
        finally:
            workbook.close()

    def _parse_rows(self, rows: Sequence[Sequence[Any]]) -> Iterator[Movement]:
        period_start = _parse_period_start(rows)
        code: str | None = None
        name = uom = ""
        in_block = False

        for row in rows:
            col_a, col_b = _cell(row, COL_A), _cell(row, COL_B)
            text_b = _text(col_b)

            if text_b.upper().startswith("TOTAL GENERAL"):
                return

            article = _text(_cell(row, COL_E))
            if article.upper().startswith("ARTICULO:"):
                code = article.split(":", 1)[1].strip()
                name, uom, in_block = "", "", False
                continue

            if code is None:
                continue

            if text_b.upper().startswith("TOTAL ") and isinstance(col_a, (type(None), str)):
                code, in_block = None, False
                continue

            if not in_block:
                text_a = _text(col_a)
                is_item_row = (
                    bool(text_a)
                    and bool(text_b)
                    and ":" not in text_a
                    and text_a.upper() not in _HEADER_LABELS
                    and _as_datetime(col_a) is None
                )
                if is_item_row:
                    name, uom, in_block = text_b, _text(_cell(row, COL_K)), True
                continue

            movement = self._parse_movement(row, code, name, uom, period_start)
            if movement is not None:
                yield movement

    @staticmethod
    def _parse_movement(
        row: Sequence[Any], sku: str, name: str, uom: str, period_start: datetime | None
    ) -> Movement | None:
        counterparty = _text(_cell(row, COL_J))
        timestamp = _as_datetime(_cell(row, COL_A))
        is_opening = counterparty.upper().startswith(OPENING_BALANCE_TYPE)

        if is_opening:
            timestamp = timestamp or period_start
            balance = _number(_cell(row, COL_S_FINAL))
            if balance is None:
                balance = _number(_cell(row, COL_S_INICIAL))
            if timestamp is None:
                return None
            return Movement(
                sku=sku,
                sku_name=name,
                uom=uom,
                timestamp=timestamp,
                movement_code="",
                movement_type=OPENING_BALANCE_TYPE,
                document="",
                counterparty="",
                qty_in=0.0,
                qty_out=0.0,
                balance=balance,
            )

        if timestamp is None:
            return None
        return Movement(
            sku=sku,
            sku_name=name,
            uom=uom,
            timestamp=timestamp,
            movement_code=_text(_cell(row, COL_B)),
            movement_type=_text(_cell(row, COL_C)),
            document=_text(_cell(row, COL_H)),
            counterparty=counterparty,
            qty_in=_number(_cell(row, COL_INGRESOS)) or 0.0,
            qty_out=_number(_cell(row, COL_SALIDAS)) or 0.0,
            balance=_number(_cell(row, COL_S_FINAL)),
        )
