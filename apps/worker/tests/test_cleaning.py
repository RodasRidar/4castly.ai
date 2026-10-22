from datetime import date, datetime

import polars as pl
import pytest
from pandera.errors import SchemaError

from worker.adapters.ingestion import KardexExcelSource
from worker.application.cleaning import (
    MovementsSchema,
    build_demand_frame,
    movements_to_frame,
    to_demand_series,
)
from worker.domain.models import Movement


@pytest.fixture
def movements_frame(kardex_path) -> pl.DataFrame:
    return movements_to_frame(KardexExcelSource(kardex_path).read_movements())


def _acid(frame: pl.DataFrame) -> dict[date, tuple[float, bool]]:
    rows = frame.filter(pl.col("sku") == "A001").iter_rows(named=True)
    return {r["ds"]: (r["y"], r["censored"]) for r in rows}


def test_schema_rejects_negative_quantities(movements_frame) -> None:
    bad = movements_frame.with_columns(pl.lit(-1.0).alias("qty_out"))
    with pytest.raises(SchemaError):
        MovementsSchema.validate(bad)


def test_demand_is_sales_minus_returns_excluding_other_codes(movements_frame) -> None:
    daily = _acid(build_demand_frame(movements_frame, "daily"))
    assert daily[date(2025, 1, 3)][0] == 80.0  # 50 + 30 sales
    assert (
        daily[date(2025, 1, 4)][0] == 30.0
    )  # 40 sale - 10 return; transfer(20) and adjust(10) ignored
    assert daily[date(2025, 1, 2)][0] == 0.0  # import is not demand
    assert daily[date(2025, 1, 1)][0] == 0.0  # opening balance is not demand


def test_zero_fill_covers_full_range(movements_frame) -> None:
    daily = _acid(build_demand_frame(movements_frame, "daily"))
    assert min(daily) == date(2025, 1, 1)
    assert max(daily) == date(2025, 1, 8)
    assert len(daily) == 8
    assert daily[date(2025, 1, 5)][0] == 0.0


def test_stockout_periods_are_flagged_as_censored(movements_frame) -> None:
    daily = _acid(build_demand_frame(movements_frame, "daily"))
    assert daily[date(2025, 1, 6)] == (160.0, True)  # balance hit 0
    assert daily[date(2025, 1, 7)] == (0.0, True)  # still out of stock, no movements
    assert daily[date(2025, 1, 8)][1] is False  # restocked
    assert daily[date(2025, 1, 3)][1] is False


def test_weekly_resampling_sums_demand(movements_frame) -> None:
    weekly = build_demand_frame(movements_frame, "weekly").filter(pl.col("sku") == "A001")
    assert weekly["ds"].to_list() == [date(2024, 12, 30), date(2025, 1, 6)]
    assert weekly["y"].to_list() == [110.0, 160.0]  # Jan 3-4 (80+30) vs Mon Jan 6 (160)
    assert weekly["censored"].to_list() == [False, True]


def test_to_demand_series_builds_one_series_per_sku(movements_frame) -> None:
    series = to_demand_series(build_demand_frame(movements_frame, "daily"), "daily")
    assert {s.sku for s in series} == {"A001", "B002"}
    acid = next(s for s in series if s.sku == "A001")
    assert len(acid.y) == len(acid.ds) == len(acid.censored) == 8


def _mv(day: str, code: str, qty_in: float, qty_out: float, balance: float) -> Movement:
    return Movement(
        sku="LOW1",
        sku_name="LOW STOCK SKU",
        uom="KG",
        timestamp=datetime.strptime(day, "%Y-%m-%d"),
        movement_code=code,
        movement_type="SALDO INICIAL" if code == "" else "",
        document="",
        counterparty="",
        qty_in=qty_in,
        qty_out=qty_out,
        balance=balance,
    )


def test_low_stock_relative_to_typical_demand_is_censored() -> None:
    # Weekly demand: 100, 100, 190, 100 -> typical (median) = 100 per week.
    frame = movements_to_frame(
        [
            _mv("2025-01-06", "", 0, 0, 400),
            _mv("2025-01-07", "01", 0, 100, 300),
            _mv("2025-01-14", "01", 0, 100, 200),
            _mv("2025-01-21", "01", 0, 190, 10),  # 10 kg left: cannot serve a typical week
            _mv("2025-01-27", "02", 120, 0, 130),
            _mv("2025-01-28", "01", 0, 100, 30),  # 30 kg left: above 25% of a typical week
        ]
    )
    weekly = build_demand_frame(frame, "weekly")
    assert weekly["y"].to_list() == [100.0, 100.0, 190.0, 100.0]
    assert weekly["censored"].to_list() == [False, False, True, False]
