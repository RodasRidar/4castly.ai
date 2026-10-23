"""Excel helpers. Cells built from user data are forced to text so a product named
`=HYPERLINK(...)` cannot run a formula when the file is opened (S14)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from openpyxl.worksheet.worksheet import Worksheet

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def append_row(sheet: Worksheet, values: Sequence[Any]) -> None:
    """Append a row; strings that could start a formula are stored as text, never as a formula."""
    sheet.append(list(values))
    for cell in sheet[sheet.max_row]:
        if isinstance(cell.value, str) and cell.value.startswith(_FORMULA_PREFIXES):
            cell.data_type = "s"
