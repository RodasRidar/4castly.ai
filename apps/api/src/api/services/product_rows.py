"""One product's figures as the contract's `ProductRow`, from a stored metrics row."""

from __future__ import annotations

from typing import Any

from api.schemas import (
    BuyBefore,
    CoverageRange,
    ProductRow,
    QuantityRange,
    ScenarioValues,
)
from api.schemas.enums import AbcClass, BuyBeforeAction, Reliability, RiskLevel


def r1(value: Any) -> float:
    return round(float(value), 1)


def r2(value: Any) -> float:
    return round(float(value), 2)


def optional_r2(value: Any) -> float | None:
    return None if value is None else r2(value)


METRIC_COLUMNS = (
    "p.code, p.name, p.uom, m.abc_class, m.typical_demand_low, m.typical_demand_expected, "
    "m.typical_demand_high, m.current_stock, m.coverage_weeks_lower, m.coverage_weeks_expected, "
    "m.coverage_weeks_upper, m.risk, m.stockout_date, m.suggested_qty_low, m.suggested_qty_high, "
    "m.suggested_truncated, m.buy_before_action, m.buy_before_date, m.earliest_buy_date, "
    "m.weeks_without_stock, m.lead_time_days, m.lead_time_overridden, m.target_coverage_weeks, "
    "m.on_order_qty, m.reliability, m.reliability_detail, p.id as product_id"
)


def product_row(row: Any, *, stock_known: bool = True) -> ProductRow:
    """From a stored metrics row. Without stock the figures that depend on it are `null` (D17)."""
    return ProductRow(
        code=row.code,
        name=row.name,
        uom=row.uom,
        abc_class=AbcClass(row.abc_class),
        typical_demand=ScenarioValues(
            low=r1(row.typical_demand_low),
            expected=r1(row.typical_demand_expected),
            high=r1(row.typical_demand_high),
        ),
        current_stock=r1(row.current_stock) if stock_known else None,
        coverage_weeks=CoverageRange(
            lower=optional_r2(row.coverage_weeks_lower),
            expected=optional_r2(row.coverage_weeks_expected),
            upper=optional_r2(row.coverage_weeks_upper),
        )
        if stock_known
        else None,
        risk=RiskLevel(row.risk) if stock_known else None,
        reliability=Reliability(row.reliability),
        stockout_date=row.stockout_date if stock_known else None,
        suggested_quantity=QuantityRange(
            low=r1(row.suggested_qty_low), high=r1(row.suggested_qty_high)
        )
        if stock_known
        else None,
        suggested_truncated=row.suggested_truncated if stock_known else False,
        buy_before=BuyBefore(
            action=BuyBeforeAction(row.buy_before_action),
            date=row.buy_before_date,
            earliest_date=row.earliest_buy_date,
            weeks_without_stock=r2(row.weeks_without_stock),
        )
        if stock_known
        else None,
        lead_time_days=row.lead_time_days,
        lead_time_overridden=row.lead_time_overridden,
        target_coverage_weeks=row.target_coverage_weeks,
        on_order_quantity=r1(row.on_order_qty),
    )
