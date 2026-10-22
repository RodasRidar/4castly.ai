"""Synthetic Kardex workbook builder. Never copy real client data into this repo."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest
from openpyxl import Workbook

# 0-based column indexes used by the real report.
A, B, C, E, H, I, J, K, L, M, N, O, P = 0, 1, 2, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15


def _row(**cells: object) -> list[object]:
    row: list[object] = [""] * 16
    for col, value in cells.items():
        row[{"A": A, "B": B, "C": C, "E": E, "H": H, "I": I, "J": J, "K": K,
             "L": L, "M": M, "N": N, "O": O, "P": P}[col]] = value
    return row


def _movement(day: str, code: str, kind: str, doc: str, who: str,
              qty_in: float | str, qty_out: float | str, balance: float) -> list[object]:
    return _row(A=datetime.strptime(day, "%Y-%m-%d"), B=code, C=kind, H=doc,
                J=who, M=qty_in, N=qty_out, O=balance)


def _block(code: str, name: str, uom: str, opening: float, movements: list[list[object]]) -> list[list[object]]:
    return [
        _row(E=f"ARTICULO: {code}"),
        _row(A="LOTE: <TODOS>"),
        _row(A="ARTICULO", C="CANTIDAD", E="COSTO"),
        _row(A="FECHA", B="CODIGO", C="TIPO", H="NRO. COMP.", I="OBSERV.",
             J="PROV/CLIENTE", K="LOTE", L="S.INICIAL", M="INGRESOS", N="SALIDAS", O="S.FINAL"),
        _row(A=code, B=name, K=uom),
        _row(J="SALDO INICIAL ", L=opening, O=opening),
        *movements,
        _row(B=f"TOTAL {name}"),
    ]


@pytest.fixture
def kardex_path(tmp_path: Path) -> Path:
    sale, imp = "Salida por Venta", "Ingreso por Importacion"
    ret = "Ingreso por Devolución de Cliente"
    transfer, adjust = "Salida Tranferencia entre Almacenes", "Salida Ajuste Inventario"

    acid = [
        _movement("2025-01-02", "02", imp, "IMP-1", "ACME SUPPLIER", 200, "", 300),
        _movement("2025-01-03", "01", sale, "F001-1", "CLIENT A", "", 50, 250),
        _movement("2025-01-03", "01", sale, "F001-2", "CLIENT B", "", 30, 220),
        _movement("2025-01-04", "01", sale, "F001-3", "CLIENT A", "", 40, 180),
        _movement("2025-01-04", "05", ret, "NC-1", "CLIENT A", 10, "", 190),
        _movement("2025-01-04", "11", transfer, "TR-1", "WH2", "", 20, 170),
        _movement("2025-01-04", "99", adjust, "AJ-1", "", "", 10, 160),
        _movement("2025-01-06", "01", sale, "F001-4", "CLIENT C", "", 160, 0),
        _movement("2025-01-08", "02", imp, "IMP-2", "ACME SUPPLIER", 100, "", 100),
    ]
    solvent = [_movement("2025-01-03", "01", sale, "F002-1", "CLIENT B", "", 10, 40)]

    rows: list[list[object]] = [
        _row(A="ACME CHEMICALS S.A."),
        _row(A="KARDEX DETALLADO DE ARTICULOS"),
        _row(A="ALMACEN: <TODOS>"),
        _row(A="DEL 1/01/2025 AL 31/01/2025"),
        *_block("A001", "ACID X", "KG", 100, acid),
        *_block("B002", "SOLVENT Y", "LT", 50, solvent),
        _row(B="TOTAL GENERAL"),
    ]
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    for r in rows:
        ws.append(r)
    path = tmp_path / "kardex_synthetic.xlsx"
    wb.save(path)
    return path
