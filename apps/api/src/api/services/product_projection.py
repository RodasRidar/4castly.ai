"""Week-by-week projection of one product: the formulas package applied to the stored forecast.

Nothing here forecasts. The worker stored the three demand scenarios; these functions rebuild the
`inventory` inputs from them (the same way the worker did) so the API can show the weekly table,
the chart, and what-if variants without a new run.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

import inventory as inv

from api.schemas import (
    Arrival,
    BuyBefore,
    DateSpan,
    ProductProjection,
    PurchaseRecommendation,
    QuantityRange,
    ScenarioValues,
    SeriesPoint,
    WeeklyProjectionRow,
)
from api.schemas.enums import BuyBeforeAction, WeekStatus
from api.services.product_rows import optional_r2, r1, r2

_ACTIONS = {
    "order_today": BuyBeforeAction.ORDER_TODAY,
    "order_by_week": BuyBeforeAction.ORDER_BY_DATE,
    "no_stockout": BuyBeforeAction.NO_STOCKOUT,
}


def week_date(data_until: date, week: int) -> date:
    return inv.week_start(data_until, week)


def build_inputs(
    *,
    stock: float,
    forecast: Sequence[tuple[float, float, float]],
    lead_time_days: int,
    target_coverage_weeks: int,
    on_order: float,
) -> inv.ProductInputs:
    """`forecast` is (low, expected, high) per week. Existing orders arrive at the lead time, the
    same assumption the worker makes when it computes the stored figures."""
    demand = inv.Demand(
        low=tuple(w[0] for w in forecast),
        expected=tuple(w[1] for w in forecast),
        high=tuple(w[2] for w in forecast),
    )
    lead_weeks = inv.lead_time_weeks(lead_time_days)
    arrivals = {lead_weeks: on_order} if on_order > 0 and lead_weeks <= demand.weeks else {}
    return inv.ProductInputs(stock, demand, lead_time_days, target_coverage_weeks, arrivals)


def buy_before(buy: inv.BuyBefore, data_until: date, today: date) -> BuyBefore:
    if buy.earliest_week is None:
        earliest = None
    elif buy.earliest_week == 0:
        earliest = today
    else:
        earliest = week_date(data_until, buy.earliest_week)
    return BuyBefore(
        action=_ACTIONS[buy.action],
        date=week_date(data_until, buy.week) if buy.week else None,
        earliest_date=earliest,
        weeks_without_stock=r2(buy.weeks_without_stock),
    )


def recommendation(
    analysis: inv.ProductAnalysis, inputs: inv.ProductInputs, data_until: date, today: date
) -> PurchaseRecommendation:
    return PurchaseRecommendation(
        lead_time_days=inputs.lead_time_days,
        target_coverage_weeks=inputs.target_coverage_weeks,
        suggested_quantity=QuantityRange(
            low=r1(analysis.suggested.low), high=r1(analysis.suggested.high)
        ),
        truncated=analysis.suggested.truncated,
        buy_before=buy_before(analysis.buy_before, data_until, today),
    )


def _scenario(low: float, expected: float, high: float) -> ScenarioValues:
    return ScenarioValues(low=r1(low), expected=r1(expected), high=r1(high))


def _spans(days: list[date]) -> list[DateSpan]:
    """Merge consecutive week starts into spans (each week covers seven days)."""
    spans: list[DateSpan] = []
    for day in sorted(days):
        if spans and day - spans[-1].end <= timedelta(days=1):
            spans[-1] = DateSpan(start=spans[-1].start, end=day + timedelta(days=6))
        else:
            spans.append(DateSpan(start=day, end=day + timedelta(days=6)))
    return spans


def projection(
    inputs: inv.ProductInputs,
    analysis: inv.ProductAnalysis,
    weeks: Sequence[date],
    history: Sequence[Any],
) -> ProductProjection:
    """`weeks` are the forecast week starts; `history` rows have `period`, `demand`, `censored`."""
    rows: list[WeeklyProjectionRow] = []
    forecast_points: list[SeriesPoint] = []
    demand = inputs.demand
    for index, start in enumerate(weeks):
        week = index + 1
        arrival = inputs.arrivals.get(week, 0.0)
        shortfall = analysis.expected.shortfall[index]
        status = (
            WeekStatus.STOCKOUT
            if shortfall > 0
            else WeekStatus.ARRIVAL
            if arrival > 0
            else WeekStatus.IN_STOCK
        )
        rows.append(
            WeeklyProjectionRow(
                week=week,
                week_start=start,
                demand=_scenario(demand.low[index], demand.expected[index], demand.high[index]),
                projected_stock=_scenario(
                    analysis.low.stock[index],
                    analysis.expected.stock[index],
                    analysis.high.stock[index],
                ),
                shortfall=_scenario(
                    analysis.low.shortfall[index],
                    shortfall,
                    analysis.high.shortfall[index],
                ),
                arrival_quantity=r1(arrival),
                status=status,
            )
        )
        forecast_points.append(
            SeriesPoint(
                date=start,
                expected=r1(demand.expected[index]),
                low=r1(demand.low[index]),
                high=r1(demand.high[index]),
                projected_stock=r1(analysis.expected.stock[index]),
            )
        )
    past = [
        SeriesPoint(date=h.period, actual=r1(h.demand), censored=bool(h.censored)) for h in history
    ]
    return ProductProjection(
        weekly=rows,
        series=[*past, *forecast_points],
        stockout_zones=[
            *_spans([p.date for p in past if p.censored]),
            *_spans([r.week_start for r in rows if r.status is WeekStatus.STOCKOUT]),
        ],
        arrivals=[
            Arrival(date=weeks[week - 1], quantity=r1(qty))
            for week, qty in sorted(inputs.arrivals.items())
            if week <= len(weeks)
        ],
    )


def coverage_values(analysis: inv.ProductAnalysis) -> tuple[float | None, ...]:
    c = analysis.coverage
    return (optional_r2(c.lower), optional_r2(c.expected), optional_r2(c.upper))
