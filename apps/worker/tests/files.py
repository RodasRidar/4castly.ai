"""Synthetic upload files. Never copy real client data into this repo."""

from __future__ import annotations

import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

CODES = [
    ("QF-0001", "Ácido cítrico", "kg"),
    ("QF-0002", "Glicerina", "L"),
    ("QF-0003", "Frasco PET", "u"),
]
FIRST_MONDAY = date(2026, 1, 5)
WEEKS = 12


def sales_rows() -> list[tuple[date, str, str, float, str]]:
    """Weekly sales for three products; product 3 also has a return (negative quantity)."""
    rows = []
    for week in range(WEEKS):
        day = FIRST_MONDAY + timedelta(weeks=week)
        for index, (code, name, unit) in enumerate(CODES):
            rows.append((day, code, name, 100.0 * (index + 1) + week, unit))
    rows.append((FIRST_MONDAY + timedelta(weeks=2), "QF-0003", "Frasco PET", -10.0, "u"))
    return rows


def write_sales_csv(path: Path, *, decimal: str = ",", delimiter: str = ";") -> Path:
    """Latin-1 CSV as Spanish ERPs export it, with dd/mm/yyyy dates and decimal commas."""
    lines = [delimiter.join(["Fecha Doc", "Cod Art", "Artículo", "Cant", "Unidad"])]
    for day, code, name, qty, unit in sales_rows():
        number = f"{qty:,.1f}".replace(",", "X").replace(".", decimal).replace("X", ".")
        lines.append(delimiter.join([day.strftime("%d/%m/%Y"), code, name, number, unit]))
    # Rows the executor must drop and count: no date, no code, unparseable quantity.
    lines.append(delimiter.join(["", "QF-0001", "Ácido cítrico", "5", "kg"]))
    lines.append(delimiter.join(["12/01/2026", "", "Sin código", "5", "kg"]))
    lines.append(delimiter.join(["12/01/2026", "QF-0001", "Ácido cítrico", "mucho", "kg"]))
    path.write_bytes(("\n".join(lines) + "\n").encode("cp1252"))
    return path


def write_sales_xlsx(path: Path, *, title_rows: int = 2) -> Path:
    """Native dates and numbers, with a title block above the header like real exports."""
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.title = "Ventas"
    for i in range(title_rows):
        sheet.append([f"REPORTE DE VENTAS {i}"])
    sheet.append(["Fecha", "Código", "Descripción", "Cantidad", "UM", "Stock"])
    stock = 5000.0
    for day, code, name, qty, unit in sales_rows():
        stock = max(0.0, stock - qty)
        sheet.append([datetime.combine(day, datetime.min.time()), code, name, qty, unit, stock])
    workbook.create_sheet("Resumen").append(["nada", "aquí"])
    workbook.save(path)
    return path


def write_encrypted_looking(path: Path) -> Path:
    path.write_bytes(bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 512)
    return path


def write_zip_without_workbook(path: Path) -> Path:
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("hello.txt", "not a workbook")
    return path


def write_macro_zip(path: Path) -> Path:
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("xl/workbook.xml", "<workbook/>")
        archive.writestr("xl/vbaProject.bin", b"binary")
    return path
