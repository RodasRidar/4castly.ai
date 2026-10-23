"""Risk, typical demand, suggested purchase, buy-before and the composed product analysis."""

from __future__ import annotations

from dataclasses import replace

from inventory.errors import InvalidInputError
from inventory.models import (
    BuyBefore,
    CoverageRange,
    Demand,
    ProductAnalysis,
    ProductInputs,
    QuantityRange,
    RiskLevel,
    RiskThresholds,
    Scenario,
    ScenarioProjection,
    SuggestedQuantity,
)
from inventory.projection import lead_time_weeks, project_scenario

TYPICAL_WINDOW_WEEKS = 4
DEFAULT_THRESHOLDS = RiskThresholds()


def typical_weekly_demand(demand: Demand, window: int = TYPICAL_WINDOW_WEEKS) -> QuantityRange:
    """Mean weekly demand over the next `window` weeks, per scenario."""

    def mean(series: tuple[float, ...]) -> float:
        head = series[:window]
        return sum(head) / len(head)

    return QuantityRange(
        low=mean(demand.low), expected=mean(demand.expected), high=mean(demand.high)
    )


def classify_risk(
    coverage_weeks: float | None,
    lead_time_weeks: int,
    horizon_weeks: int,
    thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
) -> RiskLevel:
    """Risk from expected coverage. No stockout in the horizon counts as `horizon_weeks`,
    the lower bound of the real coverage."""
    coverage = horizon_weeks if coverage_weeks is None else coverage_weeks
    if coverage < lead_time_weeks + thresholds.critical_margin_weeks:
        return RiskLevel.CRITICAL
    if coverage < lead_time_weeks + thresholds.medium_margin_weeks:
        return RiskLevel.MEDIUM
    return RiskLevel.OPTIMAL


def suggest_quantity(inputs: ProductInputs, lead_weeks: int) -> SuggestedQuantity:
    """Purchase range to cover lead time + target coverage.

    low  = max(0, expected demand over H weeks - stock - on order inside H)
    high = low + exposure during replenishment (high - expected demand over the lead time)
    """
    demand = inputs.demand
    window = lead_weeks + inputs.target_coverage_weeks
    covered = min(window, demand.weeks)
    on_order = sum(qty for week, qty in inputs.arrivals.items() if week <= covered)
    need = sum(demand.expected[:covered]) - inputs.stock - on_order
    buffer = sum(
        high - mid
        for high, mid in zip(demand.high[:lead_weeks], demand.expected[:lead_weeks], strict=False)
    )
    low = max(0.0, need)
    return SuggestedQuantity(low=low, high=low + buffer, truncated=window > demand.weeks)


def buy_before(
    expected: ScenarioProjection, high: ScenarioProjection, lead_weeks: int
) -> BuyBefore:
    """Order timing: stockout week minus lead time; `order_today` once it is already past."""
    earliest = None if high.stockout_week is None else max(0, high.stockout_week - lead_weeks)
    if expected.stockout_week is None or expected.coverage_weeks is None:
        return BuyBefore("no_stockout", None, earliest, 0.0)
    latest = expected.stockout_week - lead_weeks
    gap = max(0.0, lead_weeks - expected.coverage_weeks)
    if latest <= 0:
        return BuyBefore("order_today", None, earliest, gap)
    return BuyBefore("order_by_week", latest, earliest, gap)


def with_purchase(inputs: ProductInputs, quantity: float) -> ProductInputs:
    """Inputs with a purchase of `quantity` arriving at the lead time ("Con compra sugerida")."""
    if quantity < 0:
        raise InvalidInputError("purchase quantity cannot be negative")
    arrival_week = lead_time_weeks(inputs.lead_time_days)
    arrivals = dict(inputs.arrivals)
    arrivals[arrival_week] = arrivals.get(arrival_week, 0.0) + quantity
    return replace(inputs, arrivals=arrivals)


def analyze_product(
    inputs: ProductInputs, thresholds: RiskThresholds = DEFAULT_THRESHOLDS
) -> ProductAnalysis:
    """Run every formula of the spec table for one product."""
    if inputs.target_coverage_weeks < 0:
        raise InvalidInputError("target coverage cannot be negative")
    lead_weeks = lead_time_weeks(inputs.lead_time_days)

    def project(scenario: Scenario) -> ScenarioProjection:
        return project_scenario(inputs.stock, inputs.demand.series(scenario), inputs.arrivals)

    low, expected, high = (project(s) for s in (Scenario.LOW, Scenario.EXPECTED, Scenario.HIGH))
    return ProductAnalysis(
        lead_time_weeks=lead_weeks,
        low=low,
        expected=expected,
        high=high,
        typical_demand=typical_weekly_demand(inputs.demand),
        coverage=CoverageRange(
            lower=high.coverage_weeks,
            expected=expected.coverage_weeks,
            upper=low.coverage_weeks,
        ),
        risk=classify_risk(expected.coverage_weeks, lead_weeks, inputs.demand.weeks, thresholds),
        suggested=suggest_quantity(inputs, lead_weeks),
        buy_before=buy_before(expected, high, lead_weeks),
    )
