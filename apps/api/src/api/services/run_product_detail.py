"""Product detail (without and with the suggested purchase) and the what-if simulation."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import inventory as inv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import NotFoundError
from api.schemas import (
    CoverageRange,
    ForecastMethod,
    ProductDetail,
    ProductRow,
    QuantityRange,
    ReliabilityDetail,
    SimulationRequest,
    SimulationResult,
)
from api.schemas.enums import Reliability, RiskLevel
from api.services import product_projection as pp
from api.services.clock import user_clock
from api.services.product_rows import METRIC_COLUMNS, product_row, r1
from api.services.run_data import RunInfo, load_run

_PRODUCT = text(
    f"select {METRIC_COLUMNS} from public.run_product_metrics m "  # noqa: S608 - constant columns
    "join public.products p on p.tenant_id = m.tenant_id and p.id = m.product_id "
    "where m.run_id = :run and p.code = :code"
)
_FORECAST = text(
    "select horizon, p10, p50, p90 from public.forecasts "
    "where run_id = :run and product_id = :product order by horizon"
)
_HISTORY = text(
    "select period, demand, censored from public.demand_series "
    "where product_id = :product and freq = 'weekly' order by period"
)


class _Loaded:
    """Everything stored about one product in one run."""

    def __init__(self, info: RunInfo, row: Any, forecast: list[Any], history: list[Any]) -> None:
        self.info, self.row, self.history = info, row, history
        self.weeks = [f.horizon for f in forecast]
        self.demand = [(float(f.p10), float(f.p50), float(f.p90)) for f in forecast]

    def inputs(
        self, lead_time_days: int | None = None, target: int | None = None
    ) -> inv.ProductInputs:
        return pp.build_inputs(
            stock=float(self.row.current_stock),
            forecast=self.demand,
            lead_time_days=lead_time_days or self.row.lead_time_days,
            target_coverage_weeks=self.row.target_coverage_weeks if target is None else target,
            on_order=float(self.row.on_order_qty),
        )


async def _load(session: AsyncSession, run_id: UUID, code: str) -> _Loaded:
    info = await load_run(session, run_id)
    row = (await session.execute(_PRODUCT, {"run": run_id, "code": code})).one_or_none()
    if row is None:
        raise NotFoundError
    scope = {"run": run_id, "product": row.product_id}
    forecast = (await session.execute(_FORECAST, scope)).all()
    history = (await session.execute(_HISTORY, {"product": row.product_id})).all()
    return _Loaded(info, row, list(forecast), list(history))


async def get_detail(
    session: AsyncSession, who: Principal, run_id: UUID, code: str
) -> ProductDetail:
    loaded = await _load(session, run_id, code)
    today = (await user_clock(session, who)).today
    data_until, row = loaded.info.data_until, loaded.row
    inputs = loaded.inputs()
    analysis = inv.analyze_product(inputs, loaded.info.thresholds)
    bought = inv.with_purchase(inputs, analysis.suggested.low)
    stored = product_row(row)
    detail = row.reliability_detail or {}
    return ProductDetail(
        product=stored,
        data_until=data_until,
        today=today,
        purchase=pp.recommendation(analysis, inputs, data_until, today).model_copy(
            update={
                "suggested_quantity": stored.suggested_quantity,
                "truncated": stored.suggested_truncated,
                "buy_before": stored.buy_before,
            }
        ),
        reliability=ReliabilityDetail(
            level=Reliability(row.reliability),
            method=ForecastMethod(detail.get("method", "model")),
            history_weeks=int(detail.get("history_weeks", len(loaded.history))),
            non_censored_weeks=int(detail.get("non_censored_weeks", 0)),
            backtest_error_pct=detail.get("wape_pct"),
        ),
        without_new_purchase=pp.projection(inputs, analysis, loaded.weeks, loaded.history),
        with_suggested_purchase=pp.projection(
            bought,
            inv.analyze_product(bought, loaded.info.thresholds),
            loaded.weeks,
            loaded.history,
        ),
    )


def _simulated_row(
    stored: ProductRow,
    inputs: inv.ProductInputs,
    analysis: inv.ProductAnalysis,
    loaded: _Loaded,
    today: Any,
) -> ProductRow:
    data_until = loaded.info.data_until
    stockout = analysis.expected.stockout_week
    default_lead = loaded.info.applied().lead_time_days
    return stored.model_copy(
        update={
            "coverage_weeks": CoverageRange(
                lower=pp.optional_r2(analysis.coverage.lower),
                expected=pp.optional_r2(analysis.coverage.expected),
                upper=pp.optional_r2(analysis.coverage.upper),
            ),
            "risk": RiskLevel(analysis.risk.value),
            "stockout_date": pp.week_date(data_until, stockout) if stockout else None,
            "suggested_quantity": QuantityRange(
                low=r1(analysis.suggested.low), high=r1(analysis.suggested.high)
            ),
            "suggested_truncated": analysis.suggested.truncated,
            "buy_before": pp.buy_before(analysis.buy_before, data_until, today),
            "lead_time_days": inputs.lead_time_days,
            "lead_time_overridden": inputs.lead_time_days != default_lead,
            "target_coverage_weeks": inputs.target_coverage_weeks,
            "on_order_quantity": r1(sum(inputs.arrivals.values())),
        }
    )


async def simulate(
    session: AsyncSession,
    who: Principal,
    run_id: UUID,
    code: str,
    body: SimulationRequest,
) -> SimulationResult:
    loaded = await _load(session, run_id, code)
    today = (await user_clock(session, who)).today
    base = loaded.inputs(body.lead_time_days, body.target_coverage_weeks)
    thresholds = loaded.info.thresholds
    advice = inv.analyze_product(base, thresholds)
    final, result = base, advice
    if body.with_purchase:
        quantity = (
            advice.suggested.low if body.purchase_quantity is None else body.purchase_quantity
        )
        final = inv.with_purchase(base, quantity)
        result = inv.analyze_product(final, thresholds)
    return SimulationResult(
        product=_simulated_row(product_row(loaded.row), final, result, loaded, today),
        purchase=pp.recommendation(advice, base, loaded.info.data_until, today),
        projection=pp.projection(final, result, loaded.weeks, loaded.history),
    )
