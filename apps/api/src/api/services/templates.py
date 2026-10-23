"""The sales template users download, generated at request time (the repo hooks block `*.xlsx`)."""

from __future__ import annotations

import io

from openpyxl import Workbook

from api.services.exports import append_row

HEADERS = ("Fecha", "Código", "Producto", "Cantidad", "Stock", "Unidad")
EXAMPLE = ("2026-01-05", "QF-0001", "Ácido cítrico", 120, 480, "kg")


def sales_template() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Ventas"
    append_row(sheet, HEADERS)
    append_row(sheet, EXAMPLE)
    for column, width in zip("ABCDEF", (12, 12, 32, 12, 12, 10), strict=True):
        sheet.column_dimensions[column].width = width
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
