from datetime import datetime

from worker.adapters.ingestion import KardexExcelSource
from worker.ports import MovementSource


def test_satisfies_movement_source_port(kardex_path) -> None:
    assert isinstance(KardexExcelSource(kardex_path), MovementSource)


def test_parses_multiple_article_blocks(kardex_path) -> None:
    movements = KardexExcelSource(kardex_path).read_movements()
    by_sku = {}
    for m in movements:
        by_sku.setdefault(m.sku, []).append(m)

    assert set(by_sku) == {"A001", "B002"}
    assert len(by_sku["A001"]) == 10  # opening balance + 9 movements
    assert len(by_sku["B002"]) == 2
    assert {m.sku_name for m in by_sku["A001"]} == {"ACID X"}
    assert {m.uom for m in by_sku["A001"]} == {"KG"}
    assert {m.uom for m in by_sku["B002"]} == {"LT"}


def test_opening_balance_uses_period_start_and_balance(kardex_path) -> None:
    opening = next(m for m in KardexExcelSource(kardex_path).read_movements() if m.sku == "A001")
    assert opening.is_opening_balance
    assert opening.movement_code == ""
    assert opening.timestamp == datetime(2025, 1, 1)
    assert opening.balance == 100.0


def test_movement_fields_and_empty_cells(kardex_path) -> None:
    movements = KardexExcelSource(kardex_path).read_movements()
    sale = next(m for m in movements if m.document == "F001-2")
    assert (sale.movement_code, sale.counterparty) == ("01", "CLIENT B")
    assert sale.movement_type == "Salida por Venta"
    assert (sale.qty_in, sale.qty_out, sale.balance) == (0.0, 30.0, 220.0)

    imported = next(m for m in movements if m.document == "IMP-1")
    assert (imported.qty_in, imported.qty_out) == (200.0, 0.0)


def test_totals_rows_are_not_movements(kardex_path) -> None:
    movements = KardexExcelSource(kardex_path).read_movements()
    assert all(not m.sku_name.startswith("TOTAL") for m in movements)
    assert all(m.timestamp is not None for m in movements)
