"""Run results: the summary behind the KPI cards and the aggregate chart."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.schemas import (
    CoverageRange,
    FilterLink,
    RunKpis,
    RunSummary,
    SeriesPoint,
    UomSeries,
)
from api.schemas.enums import Reliability, RiskLevel
from api.schemas.runs import ReliabilityDistribution, ReliabilityKpi, RiskDistribution
from api.services.clock import user_clock
from api.services.run_data import forecast_run, load_run

_METRICS = text(
    "select risk, reliability, coverage_weeks_lower, coverage_weeks_expected, "
    "coverage_weeks_upper from public.run_product_metrics where run_id = :run"
)
_HISTORY = text(
    "select p.uom, d.period, sum(d.demand) as actual, bool_or(d.censored) as censored "
    "from public.demand_series d "
    "join public.products p on p.tenant_id = d.tenant_id and p.id = d.product_id "
    "where d.freq = 'weekly' and d.product_id in "
    "(select product_id from public.run_product_metrics where run_id = :run) "
    "group by p.uom, d.period order by p.uom, d.period"
)
_FORECAST = text(
    "select p.uom, f.horizon, sum(f.p10) as low, sum(f.p50) as expected, sum(f.p90) as high "
    "from public.forecasts f "
    "join public.products p on p.tenant_id = f.tenant_id and p.id = f.product_id "
    "where f.run_id = :run group by p.uom, f.horizon order by p.uom, f.horizon"
)
_TIE_ORDER = (Reliability.LOW, Reliability.MEDIUM, Reliability.HIGH)  # ties pick the safer claim


def r1(value: float) -> float:
    return round(float(value), 1)


def r2(value: float) -> float:
    return round(float(value), 2)


def _overall(counts: dict[Reliability, int]) -> Reliability:
    return max(_TIE_ORDER, key=lambda level: (counts[level], -_TIE_ORDER.index(level)))


def _coverage(rows: Sequence[Any], pick: str, horizon: int) -> float | None:
    """Mean coverage; a product without stockout counts as the horizon (a lower bound)."""
    if not rows:
        return None
    values = [getattr(row, f"coverage_weeks_{pick}") for row in rows]
    return r2(sum(horizon if v is None else float(v) for v in values) / len(values))


async def _series(session: AsyncSession, run_id: UUID) -> list[UomSeries]:
    points: dict[str, list[SeriesPoint]] = defaultdict(list)
    for row in (await session.execute(_HISTORY, {"run": run_id})).all():
        points[row.uom].append(
            SeriesPoint(date=row.period, actual=r1(row.actual), censored=bool(row.censored))
        )
    for row in (await session.execute(_FORECAST, {"run": run_id})).all():
        points[row.uom].append(
            SeriesPoint(
                date=row.horizon, expected=r1(row.expected), low=r1(row.low), high=r1(row.high)
            )
        )
    return [UomSeries(uom=uom, points=points[uom]) for uom in sorted(points)]


async def get_summary(session: AsyncSession, who: Principal, run_id: UUID) -> RunSummary:
    info = await load_run(session, run_id)
    clock = await user_clock(session, who)
    rows = (await session.execute(_METRICS, {"run": run_id})).all()
    risks = {level: sum(r.risk == level for r in rows) for level in RiskLevel}
    reliability = {level: sum(r.reliability == level for r in rows) for level in Reliability}
    known = info.stock_known  # without stock there is no risk and no coverage to report (D17)
    return RunSummary(
        run=forecast_run(info, clock.today),
        kpis=RunKpis(
            products_at_risk=FilterLink(risk=RiskLevel.CRITICAL, count=risks[RiskLevel.CRITICAL])
            if known
            else None,
            average_coverage_weeks=CoverageRange(
                lower=_coverage(rows, "lower", info.horizon_weeks),
                expected=_coverage(rows, "expected", info.horizon_weeks),
                upper=_coverage(rows, "upper", info.horizon_weeks),
            )
            if known
            else None,
            reliability=ReliabilityKpi(
                overall=_overall(reliability),
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
        )
        if known
        else None,
        total_products=len(rows),
        stock_known=info.stock_known,
        series_by_uom=await _series(session, run_id),
        today=clock.today,
    )
