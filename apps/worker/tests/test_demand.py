"""Weekly demand per product: complete weeks only, aligned to the same last week (plan 6, 12 R4)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

import polars as pl
import pytest

from worker.adapters.ingestion.kardex_excel import KardexExcelSource
from worker.adapters.ingestion.tabular import SALES_SCHEMA
from worker.application.demand import (
    NotEnoughDataError,
    demand_from_movements,
    demand_from_sales,
    last_complete_sunday,
)
from worker.domain.models import Movement


def sales(rows: list[tuple]) -> pl.DataFrame:
    return pl.DataFrame(rows, schema=SALES_SCHEMA, orient="row")


MON = date(2026, 1, 5)  # a Monday


def closing(code: str, week: int, stock: float | None = None) -> tuple:
    """A zero-quantity line on the Sunday that ends `week`: the data really reaches that day."""
    return (code, code, "u", MON + timedelta(weeks=week, days=6), 0.0, stock)


class TestLastCompleteSunday:
    @pytest.mark.parametrize(
        ("last_day", "expected"),
        [
            (date(2026, 1, 11), date(2026, 1, 11)),  # Sunday: the week is complete
            (date(2026, 1, 14), date(2026, 1, 11)),  # Wednesday: drop the partial week
            (date(2026, 1, 12), date(2026, 1, 11)),  # Monday
            (date(2026, 1, 10), date(2026, 1, 4)),  # Saturday: Sunday not reached yet
        ],
    )
    def test_the_week_must_have_ended(self, last_day: date, expected: date) -> None:
        assert last_complete_sunday(last_day) == expected


class TestFromSales:
    def test_sums_per_week_zero_fills_and_drops_the_partial_week(self) -> None:
        frame = sales(
            [
                ("A", "Producto A", "kg", MON, 10.0, None),
                ("A", "Producto A", "kg", MON + timedelta(days=2), 5.0, None),  # same week
                ("A", "Producto A", "kg", MON + timedelta(weeks=2), 7.0, None),  # gap week
                ("A", "Producto A", "kg", MON + timedelta(weeks=3, days=2), 99.0, None),  # partial
            ]
        )

        result = demand_from_sales(frame)

        [product] = result.products
        assert [(p.period, p.demand) for p in product.points] == [
            (MON, 15.0),
            (MON + timedelta(weeks=1), 0.0),
            (MON + timedelta(weeks=2), 7.0),
        ]
        assert result.data_until == MON + timedelta(weeks=3) - timedelta(days=1)  # a Sunday

    def test_returns_net_against_sales_and_demand_never_goes_negative(self) -> None:
        frame = sales(
            [
                ("A", "A", "u", MON, 10.0, None),
                ("A", "A", "u", MON + timedelta(days=1), -4.0, None),
                ("A", "A", "u", MON + timedelta(weeks=1), -9.0, None),
                ("A", "A", "u", MON + timedelta(weeks=2), 3.0, None),
                closing("A", 2),
            ]
        )

        [product] = demand_from_sales(frame).products

        assert [p.demand for p in product.points] == [6.0, 0.0, 3.0]

    def test_every_product_runs_to_the_same_last_week(self) -> None:
        frame = sales(
            [
                ("LATE", "L", "u", MON, 1.0, None),
                ("LATE", "L", "u", MON + timedelta(weeks=4), 1.0, None),
                ("EARLY", "E", "u", MON, 5.0, None),
                closing("LATE", 4),
            ]
        )

        by_code = {p.code: p for p in demand_from_sales(frame).products}

        assert len(by_code["EARLY"].points) == len(by_code["LATE"].points) == 5
        assert by_code["EARLY"].points[-1].demand == 0.0  # silence after the last sale is data

    def test_products_start_at_their_first_sale(self) -> None:
        frame = sales(
            [
                ("OLD", "O", "u", MON, 1.0, None),
                ("NEW", "N", "u", MON + timedelta(weeks=3), 2.0, None),
                ("OLD", "O", "u", MON + timedelta(weeks=4), 1.0, None),
                closing("OLD", 4),
            ]
        )

        by_code = {p.code: p for p in demand_from_sales(frame).products}

        assert by_code["NEW"].points[0].period == MON + timedelta(weeks=3)
        assert len(by_code["NEW"].points) == 2

    def test_without_a_stock_column_nothing_is_censored_and_stock_is_unknown(self) -> None:
        frame = sales([("A", "A", "u", MON + timedelta(weeks=i), 5.0, None) for i in range(4)])

        [product] = demand_from_sales(frame).products

        assert not any(p.censored for p in product.points)
        assert product.current_stock is None

    def test_stock_columns_give_current_stock_and_flag_stockout_weeks(self) -> None:
        rows = [("A", "A", "u", MON + timedelta(weeks=i), 20.0, 100.0) for i in range(6)]
        rows[3] = ("A", "A", "u", MON + timedelta(weeks=3), 20.0, 0.0)  # ran out that week
        rows[5] = ("A", "A", "u", MON + timedelta(weeks=5), 20.0, 64.0)
        rows.append(closing("A", 5, stock=64.0))

        [product] = demand_from_sales(sales(rows)).products

        assert product.current_stock == 64.0
        assert [p.censored for p in product.points] == [False, False, False, True, False, False]

    def test_the_unit_and_name_travel_with_the_product(self) -> None:
        frame = sales([("A", "Ácido cítrico", "kg", MON, 1.0, None)])
        frame = pl.concat(
            [frame, sales([("A", "Ácido cítrico", "kg", MON + timedelta(weeks=1), 1.0, None)])]
        )

        [product] = demand_from_sales(frame).products

        assert (product.name, product.uom) == ("Ácido cítrico", "kg")

    def test_no_complete_week_is_not_enough_data(self) -> None:
        frame = sales([("A", "A", "u", MON + timedelta(days=1), 5.0, None)])

        with pytest.raises(NotEnoughDataError):
            demand_from_sales(frame)

    def test_an_empty_file_is_not_enough_data(self) -> None:
        with pytest.raises(NotEnoughDataError):
            demand_from_sales(sales([]))


class TestFromMovements:
    def movement(
        self, day: date, code: str, qty_in: float, qty_out: float, balance: float
    ) -> Movement:
        return Movement(
            "A", "Producto A", "KG", datetime.combine(day, datetime.min.time()), code, "", "", "",
            qty_in, qty_out, balance,
        )  # fmt: skip

    def test_sales_minus_returns_per_week_with_the_last_balance_as_stock(self) -> None:
        movements = [
            self.movement(MON, "01", 0, 30.0, 270.0),
            self.movement(MON + timedelta(days=1), "05", 5.0, 0, 275.0),
            self.movement(MON + timedelta(days=2), "02", 100.0, 0, 375.0),  # import: not demand
            self.movement(MON + timedelta(weeks=1), "01", 0, 40.0, 335.0),
            self.movement(MON + timedelta(weeks=2, days=1), "01", 0, 10.0, 325.0),  # partial week
        ]

        result = demand_from_movements(movements)

        [product] = result.products
        assert [p.demand for p in product.points] == [25.0, 40.0]
        assert product.current_stock == 325.0
        assert product.uom == "KG"
        assert result.data_until == MON + timedelta(weeks=2) - timedelta(days=1)

    def test_a_real_kardex_parses_into_weekly_demand(self, kardex_path: Path) -> None:
        movements = KardexExcelSource(kardex_path).read_movements()

        result = demand_from_movements(movements)

        assert {p.code for p in result.products} == {"A001", "B002"}
        assert result.data_until == date(2025, 1, 5)

    def test_no_movements_is_not_enough_data(self) -> None:
        with pytest.raises(NotEnoughDataError):
            demand_from_movements([])
