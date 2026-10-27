"""Synthetic sales files for local runs. Never copy real client data into this repo."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

FIRST_MONDAY = datetime(2026, 1, 5)
WEEKS = 40
PRODUCTS = [
    ("QF-100", "ACIDO CITRICO", "KG"),
    ("QF-200", "GLICERINA", "LT"),
    ("QF-300", "FRASCO PET", "U"),
]
ROW_WIDTH = 16  # the real report spans columns A..P


def _row(cells: dict[int, object]) -> list[object]:
    row: list[object] = [""] * ROW_WIDTH
    for column, value in cells.items():
        row[column] = value
    return row


def _block(index: int, code: str, name: str, unit: str) -> list[list[object]]:
    """One article of the Kardex: weekly sales, an import every six weeks, running balance."""
    balance = 400.0
    rows = [
        _row({4: f"ARTICULO: {code}"}),
        _row({0: "LOTE: <TODOS>"}),
        _row({0: "ARTICULO", 2: "CANTIDAD", 4: "COSTO"}),
        _row(
            {0: "FECHA", 1: "CODIGO", 2: "TIPO", 7: "NRO. COMP.", 8: "OBSERV.", 9: "PROV/CLIENTE"}
            | {10: "LOTE", 11: "S.INICIAL", 12: "INGRESOS", 13: "SALIDAS", 14: "S.FINAL"}
        ),
        _row({0: code, 1: name, 10: unit}),
        _row({9: "SALDO INICIAL ", 11: balance, 14: balance}),
    ]
    for week in range(WEEKS):
        day = FIRST_MONDAY + timedelta(weeks=week)
        if week % 6 == 0 and week:
            balance += 1000
            arrival = {0: day, 1: "02", 2: "Ingreso por Importacion", 7: f"IMP-{index}-{week}"}
            rows.append(_row(arrival | {9: "ACME SUPPLIER", 12: 1000, 14: balance}))
        sold = 40.0 + 20 * index + (week % 5) * 5
        balance -= sold
        sale = {0: day + timedelta(days=2), 1: "01", 2: "Salida por Venta"}
        rows.append(_row(sale | {7: f"F001-{index}{week}", 9: "CLIENT A", 13: sold, 14: balance}))
    rows.append(_row({1: f"TOTAL {name}"}))
    return rows


def write_kardex(path: Path) -> Path:
    """A Kardex-shaped workbook: three articles, forty weeks of sales and imports."""
    rows: list[list[object]] = [
        _row({0: "ACME CHEMICALS S.A."}),
        _row({0: "KARDEX DETALLADO DE ARTICULOS"}),
        _row({0: "ALMACEN: <TODOS>"}),
        _row({0: "DEL 1/01/2026 AL 31/10/2026"}),
    ]
    for index, (code, name, unit) in enumerate(PRODUCTS):
        rows.extend(_block(index, code, name, unit))
    rows.append(_row({1: "TOTAL GENERAL"}))
    workbook = Workbook()
    sheet = workbook.active
    if sheet is None:
        message = "a new workbook always has an active sheet"
        raise RuntimeError(message)
    for row in rows:
        sheet.append(row)
    workbook.save(path)
    return path


def write_sales_csv(path: Path) -> Path:
    """Latin-1 tabular export as Spanish ERPs write it: `;` separated, dd/mm/yyyy, decimal comma."""
    lines = ["Fecha Doc;Cod Art;Artículo;Cant;Unidad"]
    for week in range(WEEKS):
        day = FIRST_MONDAY + timedelta(weeks=week)
        for index, (code, name, unit) in enumerate(PRODUCTS):
            quantity = f"{40.0 + 20 * index + (week % 5) * 5:.1f}".replace(".", ",")
            lines.append(f"{day:%d/%m/%Y};{code};{name.title()};{quantity};{unit.lower()}")
    path.write_bytes("\n".join(lines).encode("latin-1"))
    return path
