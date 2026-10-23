"""Format detection and profiling of an uploaded file (digest stage "Identificando columnas")."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from itertools import islice
from pathlib import Path
from typing import Any

from worker.adapters.ingestion import sheets
from worker.adapters.ingestion.parsing import (
    detect_date_format,
    detect_decimal_separator,
    parse_decimal,
)
from worker.domain.documents import (
    SOURCE_KARDEX,
    SOURCE_TABULAR,
    ColumnProfile,
    FileProfile,
    SheetProfile,
)
from worker.domain.errors import UnreadableFileError

HEAD_ROWS = 30
SAMPLE_ROWS = 200
SAMPLES_PER_COLUMN = 5
_KARDEX_ARTICLE_COLUMN = 4
_KARDEX_SIGNATURES = ("S.FINAL", "SALIDAS")


@dataclass(frozen=True)
class Inspection:
    profile: FileProfile
    selected_sheet: str | None
    kind: str
    """`xlsx` or `csv`, for the readers that follow."""


def normalize(name: str) -> str:
    """Lowercase, no accents, letters and digits only: how column names are compared."""
    stripped = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return "".join(ch for ch in stripped.lower() if ch.isalnum())


def _is_empty(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def render_sample(value: Any) -> str:
    if isinstance(value, datetime):
        return (
            value.date().isoformat() if value.time() == datetime.min.time() else value.isoformat()
        )
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


MIN_SHARE = 0.9
"""A column keeps its type when this share of its values fits: exports have a few dirty cells."""


def classify(values: list[Any]) -> str:
    present = [v for v in values if not _is_empty(v)]
    if not present:
        return "empty"
    natives = sum(isinstance(v, date) for v in present)
    strings = [v for v in present if isinstance(v, str)]
    if natives / len(present) >= MIN_SHARE:
        return "date"
    if not natives and strings and detect_date_format(strings, MIN_SHARE) is not None:
        return "date"
    separator = detect_decimal_separator(strings)
    numeric = sum(
        (isinstance(v, int | float) and not isinstance(v, bool))
        or (isinstance(v, str) and parse_decimal(v, separator) is not None)
        for v in present
    )
    return "number" if numeric / len(present) >= MIN_SHARE else "text"


def find_header_row(rows: list[tuple[Any, ...]]) -> int:
    """1-based index of the header: first row with 2+ cells, mostly text, followed by more rows."""
    for index, row in enumerate(rows[:-1]):
        cells = [c for c in row if not _is_empty(c)]
        if len(cells) >= 2 and sum(isinstance(c, str) for c in cells) / len(cells) >= 0.6:  # noqa: PLR2004
            return index + 1
    return 1


def _header_names(row: tuple[Any, ...]) -> list[str]:
    names = [str(c).strip() if not _is_empty(c) else "" for c in row]
    while names and not names[-1]:
        names.pop()
    return [name or f"Column {i + 1}" for i, name in enumerate(names)]


def _profile_sheet(path: Path, kind: str, name: str) -> SheetProfile:
    rows = sheets.read_rows(path, kind, name)
    head = list(islice(rows, HEAD_ROWS))
    if not head:
        return SheetProfile(name, 0, ())
    header_row = find_header_row(head)
    headers = _header_names(head[header_row - 1])
    data = [r for r in head[header_row:] if any(not _is_empty(c) for c in r)]
    count = len(data)
    for row in rows:
        if any(not _is_empty(c) for c in row):
            count += 1
            if len(data) < SAMPLE_ROWS:
                data.append(row)
    columns = []
    for index, header in enumerate(headers):
        values = [row[index] if index < len(row) else None for row in data]
        samples = tuple(render_sample(v) for v in values if not _is_empty(v))[:SAMPLES_PER_COLUMN]
        columns.append(ColumnProfile(header, classify(values), samples))
    return SheetProfile(name, count, tuple(columns), header_row)


def _is_kardex(path: Path, kind: str, name: str) -> bool:
    if kind != "xlsx":
        return False
    articles, signature = 0, False
    for row in islice(sheets.read_rows(path, kind, name), 400):
        cell = row[_KARDEX_ARTICLE_COLUMN] if len(row) > _KARDEX_ARTICLE_COLUMN else None
        articles += isinstance(cell, str) and cell.strip().upper().startswith("ARTICULO:")
        signature = signature or any(
            isinstance(c, str) and c.strip().upper() in _KARDEX_SIGNATURES for c in row
        )
    return articles > 0 and signature


class SheetsInspector:
    """`FileInspector` adapter for .xlsx and .csv uploads."""

    def inspect(self, path: Path, file_name: str) -> Inspection:
        kind = sheets.check_container(path, Path(file_name).suffix)
        names = sheets.sheet_names(path, kind)
        kardex = next((n for n in names if _is_kardex(path, kind, n)), None)
        if kardex is not None:
            profiles = tuple(SheetProfile(n, 0, ()) for n in names)
            return Inspection(FileProfile(SOURCE_KARDEX, profiles), kardex, kind)
        profiles = tuple(_profile_sheet(path, kind, n) for n in names)
        populated = [p for p in profiles if p.row_count > 0]
        if not populated:
            raise UnreadableFileError("empty", "no sheet has data rows")
        selected = max(populated, key=lambda p: p.row_count).name
        return Inspection(FileProfile(SOURCE_TABULAR, profiles), selected, kind)
