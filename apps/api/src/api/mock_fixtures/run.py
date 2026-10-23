"""Run fixtures: portfolio rows, product detail with and without purchase, run summary."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import inventory as inv
from inventory.fixtures import build_dataset

from api.mock_fixtures._constants import (
    DATA_UNTIL,
    HORIZON_WEEKS,
    READY_CONVERSATION,
    RUN_KEY,
    RUN_LEAD_TIME_DAYS,
    TARGET_COVERAGE_WEEKS,
    TODAY,
    ago,
    uid,
)
from api.schemas import (
    AbcClass,
    Arrival,
    AssistantStyle,
    BuyBefore,
    BuyBeforeAction,
    CoverageRange,
    DateSpan,
    FilterLink,
    ForecastMethod,
    ForecastRun,
    Granularity,
    ProductDetail,
    ProductProjection,
    ProductRow,
    PurchaseRecommendation,
    Reliability,
    ReliabilityDetail,
    RiskLevel,
    RiskThresholds,
    RunKpis,
    RunParameters,
    RunStatus,
    RunSummary,
    ScenarioValues,
    SeriesPoint,
    UomSeries,
    WeeklyProjectionRow,
    WeekStatus,
)
from api.schemas import QuantityRange as ApiQuantityRange
from api.schemas.runs import ReliabilityDistribution, ReliabilityKpi, RiskDistribution

_ACTIONS = {
    "order_today": BuyBeforeAction.ORDER_TODAY,
    "order_by_week": BuyBeforeAction.ORDER_BY_DATE,
    "no_stockout": BuyBeforeAction.NO_STOCKOUT,
}
# Stand-in for the backtest-derived error (D13) in the synthetic tenant.
_BACKTEST_ERROR_PCT = {Reliability.HIGH: 22.0, Reliability.MEDIUM: 35.0, Reliability.LOW: 52.0}


@dataclass(frozen=True)
class Built:
    """One product from the formulas package, with its two analyses."""

    raw: dict[str, Any]
    inputs: inv.ProductInputs
    analysis: inv.ProductAnalysis
    purchase_inputs: inv.ProductInputs
    purchase_analysis: inv.ProductAnalysis

    @property
    def code(self) -> str:
        return str(self.raw["code"])

    @property
    def reliability(self) -> Reliability:
        return Reliability(self.raw["reliability"])


def build_products() -> list[Built]:
    built: list[Built] = []
    for raw in build_dataset()["products"]:
        forecast = raw["forecast"]
        inputs = inv.ProductInputs(
            stock=raw["stock"],
            demand=inv.Demand(
                low=tuple(forecast["low"]),
                expected=tuple(forecast["expected"]),
                high=tuple(forecast["high"]),
            ),
            lead_time_days=raw["lead_time_days"],
            target_coverage_weeks=raw["target_coverage_weeks"],
            arrivals={int(week): qty for week, qty in raw["on_order"]},
        )
        analysis = inv.analyze_product(inputs)
        purchase_inputs = inv.with_purchase(inputs, analysis.suggested.low)
        built.append(
            Built(raw, inputs, analysis, purchase_inputs, inv.analyze_product(purchase_inputs))
        )
    return built


def week_date(week: int) -> date:
    return inv.week_start(DATA_UNTIL, week)


def _r1(value: float) -> float:
    return round(value, 1)


def _r2(value: float) -> float:
    return round(value, 2)


def _optional_r2(value: float | None) -> float | None:
    return None if value is None else _r2(value)


def _buy_before(buy: inv.BuyBefore) -> BuyBefore:
    if buy.earliest_week is None:
        earliest = None
    elif buy.earliest_week == 0:
        earliest = TODAY
    else:
        earliest = week_date(buy.earliest_week)
    return BuyBefore(
        action=_ACTIONS[buy.action],
        date=week_date(buy.week) if buy.week is not None else None,
        earliest_date=earliest,
        weeks_without_stock=_r2(buy.weeks_without_stock),
    )


def _scenario(low: float, expected: float, high: float) -> ScenarioValues:
    return ScenarioValues(low=_r1(low), expected=_r1(expected), high=_r1(high))


def to_row(item: Built) -> ProductRow:
    a, raw = item.analysis, item.raw
    stockout = a.expected.stockout_week
    return ProductRow(
        code=item.code,
        name=raw["name"],
        uom=raw["uom"],
        abc_class=AbcClass(raw["abc_class"]),
        typical_demand=_scenario(
            a.typical_demand.low, a.typical_demand.expected, a.typical_demand.high
        ),
        current_stock=_r1(item.inputs.stock),
        coverage_weeks=CoverageRange(
            lower=_optional_r2(a.coverage.lower),
            expected=_optional_r2(a.coverage.expected),
            upper=_optional_r2(a.coverage.upper),
        ),
        risk=RiskLevel(a.risk.value),
        reliability=item.reliability,
        stockout_date=week_date(stockout) if stockout is not None else None,
        suggested_quantity=ApiQuantityRange(low=_r1(a.suggested.low), high=_r1(a.suggested.high)),
        suggested_truncated=a.suggested.truncated,
        buy_before=_buy_before(a.buy_before),
        lead_time_days=raw["lead_time_days"],
        lead_time_overridden=raw["lead_time_days"] != RUN_LEAD_TIME_DAYS,
        target_coverage_weeks=raw["target_coverage_weeks"],
        on_order_quantity=_r1(sum(item.inputs.arrivals.values())),
    )


def _history_start(raw: dict[str, Any]) -> date:
    return date.fromisoformat(raw["history"]["start"])


def _spans(dates: list[date]) -> list[DateSpan]:
    """Merge consecutive week starts into spans (each week covers 7 days)."""
    spans: list[DateSpan] = []
    for day in sorted(dates):
        if spans and day - spans[-1].end <= timedelta(days=1):
            spans[-1] = DateSpan(start=spans[-1].start, end=day + timedelta(days=6))
        else:
            spans.append(DateSpan(start=day, end=day + timedelta(days=6)))
    return spans


def _projection(
    raw: dict[str, Any], inputs: inv.ProductInputs, a: inv.ProductAnalysis
) -> ProductProjection:
    weekly: list[WeeklyProjectionRow] = []
    forecast_points: list[SeriesPoint] = []
    for week in range(1, inputs.demand.weeks + 1):
        i, start = week - 1, week_date(week)
        arrival = inputs.arrivals.get(week, 0.0)
        shortfall = a.expected.shortfall[i]
        status = (
            WeekStatus.STOCKOUT
            if shortfall > 0
            else WeekStatus.ARRIVAL
            if arrival > 0
            else WeekStatus.IN_STOCK
        )
        weekly.append(
            WeeklyProjectionRow(
                week=week,
                week_start=start,
                demand=_scenario(
                    inputs.demand.low[i], inputs.demand.expected[i], inputs.demand.high[i]
                ),
                projected_stock=_scenario(a.low.stock[i], a.expected.stock[i], a.high.stock[i]),
                shortfall=_scenario(a.low.shortfall[i], shortfall, a.high.shortfall[i]),
                arrival_quantity=_r1(arrival),
                status=status,
            )
        )
        forecast_points.append(
            SeriesPoint(
                date=start,
                expected=_r1(inputs.demand.expected[i]),
                low=_r1(inputs.demand.low[i]),
                high=_r1(inputs.demand.high[i]),
                projected_stock=_r1(a.expected.stock[i]),
            )
        )
    censored = set(raw["history"]["censored"])
    first = _history_start(raw)
    history = [
        SeriesPoint(date=first + timedelta(weeks=i), actual=_r1(qty), censored=i in censored)
        for i, qty in enumerate(raw["history"]["qty"])
    ]
    past_zones = _spans([p.date for p in history if p.censored])
    future_zones = _spans([w.week_start for w in weekly if w.status is WeekStatus.STOCKOUT])
    arrivals = [
        Arrival(date=week_date(week), quantity=_r1(qty))
        for week, qty in sorted(inputs.arrivals.items())
        if week <= inputs.demand.weeks
    ]
    return ProductProjection(
        weekly=weekly,
        series=[*history, *forecast_points],
        stockout_zones=[*past_zones, *future_zones],
        arrivals=arrivals,
    )


def to_detail(item: Built) -> ProductDetail:
    a, raw = item.analysis, item.raw
    return ProductDetail(
        product=to_row(item),
        data_until=DATA_UNTIL,
        today=TODAY,
        purchase=PurchaseRecommendation(
            lead_time_days=raw["lead_time_days"],
            target_coverage_weeks=raw["target_coverage_weeks"],
            suggested_quantity=ApiQuantityRange(
                low=_r1(a.suggested.low), high=_r1(a.suggested.high)
            ),
            truncated=a.suggested.truncated,
            buy_before=_buy_before(a.buy_before),
        ),
        reliability=ReliabilityDetail(
            level=item.reliability,
            method=ForecastMethod(raw["method"]),
            history_weeks=len(raw["history"]["qty"]),
            non_censored_weeks=raw["non_censored_weeks"],
            backtest_error_pct=(
                None if raw["method"] == "simple" else _BACKTEST_ERROR_PCT[item.reliability]
            ),
        ),
        without_new_purchase=_projection(raw, item.inputs, a),
        with_suggested_purchase=_projection(raw, item.purchase_inputs, item.purchase_analysis),
    )


def run_parameters() -> RunParameters:
    return RunParameters(
        horizon_weeks=HORIZON_WEEKS,
        granularity=Granularity.WEEKLY,
        lead_time_days=RUN_LEAD_TIME_DAYS,
        target_coverage_weeks=TARGET_COVERAGE_WEEKS,
        risk_thresholds=RiskThresholds(),
        assistant_style=AssistantStyle.BRIEF,
    )


def forecast_run() -> ForecastRun:
    return ForecastRun(
        id=uid(RUN_KEY),
        conversation_id=uid(READY_CONVERSATION),
        status=RunStatus.READY,
        data_until=DATA_UNTIL,
        parameters=run_parameters(),
        defaults_used=[],
        stale=inv.is_stale(DATA_UNTIL, TODAY),
        parameters_pending=False,
        created_at=ago(minutes=45),
    )


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _uom_series(items: list[Built], uom: str) -> UomSeries:
    """Sum the products of one unit of measure per date (units cannot be added together)."""
    actual: dict[date, float] = {}
    censored: set[date] = set()
    for item in items:
        first = _history_start(item.raw)
        flagged = set(item.raw["history"]["censored"])
        for i, qty in enumerate(item.raw["history"]["qty"]):
            day = first + timedelta(weeks=i)
            actual[day] = actual.get(day, 0.0) + qty
            if i in flagged:
                censored.add(day)
    points = [
        SeriesPoint(date=day, actual=_r1(qty), censored=day in censored)
        for day, qty in sorted(actual.items())
    ]
    for week in range(1, HORIZON_WEEKS + 1):
        demand = [i.inputs.demand for i in items]
        points.append(
            SeriesPoint(
                date=week_date(week),
                expected=_r1(sum(d.expected[week - 1] for d in demand)),
                low=_r1(sum(d.low[week - 1] for d in demand)),
                high=_r1(sum(d.high[week - 1] for d in demand)),
            )
        )
    return UomSeries(uom=uom, points=points)


def _overall_reliability(counts: dict[Reliability, int]) -> Reliability:
    # Ties resolve to the lower reliability: the safer claim.
    order = (Reliability.LOW, Reliability.MEDIUM, Reliability.HIGH)
    return max(order, key=lambda level: (counts[level], -order.index(level)))


def to_summary(items: list[Built]) -> RunSummary:
    rows = [to_row(i) for i in items]
    risks = {level: sum(r.risk is level for r in rows) for level in RiskLevel}
    reliability = {level: sum(r.reliability is level for r in rows) for level in Reliability}

    def coverage(pick: str) -> float:
        # A product without stockout counts as the horizon, the lower bound of its coverage.
        values = [getattr(r.coverage_weeks, pick) for r in rows]
        return _r2(_mean([HORIZON_WEEKS if v is None else v for v in values]))

    uoms = sorted({i.raw["uom"] for i in items})
    return RunSummary(
        run=forecast_run(),
        kpis=RunKpis(
            products_at_risk=FilterLink(risk=RiskLevel.CRITICAL, count=risks[RiskLevel.CRITICAL]),
            average_coverage_weeks=CoverageRange(
                lower=coverage("lower"), expected=coverage("expected"), upper=coverage("upper")
            ),
            reliability=ReliabilityKpi(
                overall=_overall_reliability(reliability),
                distribution=ReliabilityDistribution(
                    high=reliability[Reliability.HIGH],
                    medium=reliability[Reliability.MEDIUM],
                    low=reliability[Reliability.LOW],
                ),
            ),
        ),
        risk_distribution=RiskDistribution(
            critical=risks[RiskLevel.CRITICAL],
            medium=risks[RiskLevel.MEDIUM],
            optimal=risks[RiskLevel.OPTIMAL],
        ),
        total_products=len(rows),
        stock_known=True,
        series_by_uom=[_uom_series([i for i in items if i.raw["uom"] == u], u) for u in uoms],
        today=TODAY,
    )


__all__ = ["Built", "build_products", "forecast_run", "to_detail", "to_row", "to_summary"]
