"""Stock projection, shortfall, stockout week and coverage (plan section 6)."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

from inventory.errors import InvalidInputError
from inventory.models import ScenarioProjection


def lead_time_weeks(lead_time_days: int) -> int:
    """Convert a lead time entered in days to whole weeks, rounding up."""
    if lead_time_days < 1:
        raise InvalidInputError("lead time must be at least one day")
    return math.ceil(lead_time_days / 7)


def project_scenario(
    stock: float, demand: Sequence[float], arrivals: Mapping[int, float]
) -> ScenarioProjection:
    """Project one demand scenario.

    `arrivals` maps a 1-based week to the quantity received at the start of that week, before
    the week's demand is served. Arrivals past the horizon are ignored.
    """
    if stock < 0:
        raise InvalidInputError("stock cannot be negative")
    if not demand:
        raise InvalidInputError("demand needs at least one week")
    if any(week < 1 for week in arrivals):
        raise InvalidInputError("arrival weeks start at 1")

    on_hand = stock
    stock_by_week: list[float] = []
    shortfall_by_week: list[float] = []
    stockout_week: int | None = None
    coverage: float | None = None

    for week, needed in enumerate(demand, start=1):
        available = on_hand + arrivals.get(week, 0.0)
        short = max(0.0, needed - available)
        if short > 0 and stockout_week is None:
            stockout_week = week
            coverage = (week - 1) + available / needed
        on_hand = max(0.0, available - needed)
        stock_by_week.append(on_hand)
        shortfall_by_week.append(short)

    return ScenarioProjection(
        stock=tuple(stock_by_week),
        shortfall=tuple(shortfall_by_week),
        stockout_week=stockout_week,
        coverage_weeks=coverage,
    )
