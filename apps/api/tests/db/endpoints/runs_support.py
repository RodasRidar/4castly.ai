"""Seed a forecast run the way the worker publishes it, with the formulas package doing the maths.

Using `inventory.analyze_product` here (as the worker does) means the API tests check that the
API reads what the worker wrote, not a second copy of the formulas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import inventory as inv
import psycopg
from psycopg.types.json import Jsonb


def lima_today() -> date:
    """The default user time zone: what the API calls today."""
    return datetime.now(ZoneInfo("America/Lima")).date()


DATA_UNTIL = date(2026, 10, 18)
HORIZON = 12
PARAMS: dict[str, Any] = {
    "horizon_weeks": HORIZON,
    "granularity": "weekly",
    "lead_time_days": 14,
    "target_coverage_weeks": 4,
    "risk_thresholds": {"critical_margin_weeks": 0.0, "medium_margin_weeks": 2.0},
    "assistant_style": "brief",
    "defaults_used": [],
    "stock_known": True,
    "data_until": DATA_UNTIL.isoformat(),
}
_ACTION = {
    "order_today": "order_today",
    "order_by_week": "order_by_date",
    "no_stockout": "no_stockout",
}


@dataclass
class Spec:
    code: str
    name: str = "Producto"
    uom: str = "kg"
    stock: float = 100.0
    weekly: float = 20.0
    lead_days: int = 14
    target: int = 4
    on_order: float = 0.0
    overridden: bool = False
    history: tuple[float, ...] = (18.0, 22.0, 20.0, 19.0, 21.0, 20.0)
    censored: tuple[int, ...] = ()
    method: str = "model"
    reliability: str = "high"
    wape_pct: float | None = 22.0
    abc: str = "A"
    low_factor: float = 0.75
    high_factor: float = 1.4
    _extra: dict = field(default_factory=dict)

    def demand(self) -> inv.Demand:
        return inv.Demand(
            low=(self.weekly * self.low_factor,) * HORIZON,
            expected=(self.weekly,) * HORIZON,
            high=(self.weekly * self.high_factor,) * HORIZON,
        )

    def inputs(self) -> inv.ProductInputs:
        lead_weeks = inv.lead_time_weeks(self.lead_days)
        arrivals = (
            {lead_weeks: self.on_order} if self.on_order > 0 and lead_weeks <= HORIZON else {}
        )
        return inv.ProductInputs(self.stock, self.demand(), self.lead_days, self.target, arrivals)


@dataclass(frozen=True)
class RunHandle:
    run: UUID
    conversation: UUID
    products: dict[str, UUID]


def add_run(  # noqa: PLR0913
    world,
    specs: list[Spec],
    *,
    status: str = "ready",
    params: dict | None = None,
    data_until: date = DATA_UNTIL,
    conversation: UUID | None = None,
    pending: dict | None = None,
    stage: str = "ready",
) -> RunHandle:
    from .conftest import add_conversation  # noqa: PLC0415

    params: dict[str, Any] = {**PARAMS, "data_until": data_until.isoformat(), **(params or {})}
    thresholds = inv.RiskThresholds(**params["risk_thresholds"])
    conversation = conversation or add_conversation(world, stage=stage)
    run, tenant = uuid4(), world.side.tenant
    products: dict[str, UUID] = {}
    with psycopg.connect(world.dsn, autocommit=True) as admin:
        admin.execute(
            "insert into public.forecast_runs (id, tenant_id, conversation_id, status, data_until, "
            "horizon_weeks, granularity, params, pending_params) "
            "values (%s, %s, %s, %s, %s, %s, 'weekly', %s, %s)",
            [
                run,
                tenant,
                conversation,
                status,
                data_until,
                params["horizon_weeks"],
                Jsonb(params),
                Jsonb(pending) if pending else None,
            ],
        )
        for spec in specs:
            row = admin.execute(
                "insert into public.products (id, tenant_id, code, name, uom) "
                "values (%s, %s, %s, %s, %s) on conflict (tenant_id, code) "
                "do update set name = excluded.name returning id",
                [uuid4(), tenant, spec.code, spec.name, spec.uom],
            ).fetchone()
            assert row is not None
            product = row[0]
            products[spec.code] = product
            analysis = inv.analyze_product(spec.inputs(), thresholds)
            demand = spec.demand()
            for week in range(1, HORIZON + 1):
                admin.execute(
                    "insert into public.forecasts (tenant_id, product_id, run_id, horizon, p10, "
                    "p50, p90, model) values (%s, %s, %s, %s, %s, %s, %s, 'autoets')",
                    [
                        tenant,
                        product,
                        run,
                        inv.week_start(data_until, week),
                        demand.low[week - 1],
                        demand.expected[week - 1],
                        demand.high[week - 1],
                    ],
                )
            first = inv.week_start(data_until, 1) - timedelta(weeks=len(spec.history))
            for index, qty in enumerate(spec.history):
                admin.execute(
                    "insert into public.demand_series (tenant_id, product_id, freq, period, "
                    "demand, censored) values (%s, %s, 'weekly', %s, %s, %s) "
                    "on conflict (tenant_id, product_id, freq, period) do update "
                    "set demand = excluded.demand, censored = excluded.censored",
                    [tenant, product, first + timedelta(weeks=index), qty, index in spec.censored],
                )
            buy = analysis.buy_before
            stockout = analysis.expected.stockout_week
            earliest = None
            if buy.earliest_week is not None:
                earliest = (
                    lima_today()
                    if buy.earliest_week == 0
                    else inv.week_start(data_until, buy.earliest_week)
                )
            admin.execute(
                "insert into public.run_product_metrics (run_id, product_id, tenant_id, abc_class, "
                "typical_demand_low, typical_demand_expected, typical_demand_high, current_stock, "
                "coverage_weeks_lower, coverage_weeks_expected, coverage_weeks_upper, risk, "
                "stockout_date, suggested_qty_low, suggested_qty_high, suggested_truncated, "
                "buy_before_action, buy_before_date, earliest_buy_date, weeks_without_stock, "
                "lead_time_days, lead_time_overridden, target_coverage_weeks, on_order_qty, "
                "reliability, reliability_detail) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
                "%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [
                    run,
                    product,
                    tenant,
                    spec.abc,
                    analysis.typical_demand.low,
                    analysis.typical_demand.expected,
                    analysis.typical_demand.high,
                    spec.stock,
                    analysis.coverage.lower,
                    analysis.coverage.expected,
                    analysis.coverage.upper,
                    analysis.risk.value,
                    inv.week_start(data_until, stockout) if stockout else None,
                    analysis.suggested.low,
                    analysis.suggested.high,
                    analysis.suggested.truncated,
                    _ACTION[buy.action],
                    inv.week_start(data_until, buy.week) if buy.week else None,
                    earliest,
                    buy.weeks_without_stock,
                    spec.lead_days,
                    spec.overridden,
                    spec.target,
                    spec.on_order,
                    spec.reliability,
                    Jsonb(
                        {
                            "method": spec.method,
                            "history_weeks": len(spec.history),
                            "non_censored_weeks": len(spec.history) - len(spec.censored),
                            "wape_pct": spec.wape_pct,
                            "backtest_folds": 3,
                        }
                    ),
                ],
            )
        if status == "ready":
            admin.execute(
                "update public.conversations set current_run_id = %s where id = %s",
                [run, conversation],
            )
    return RunHandle(run, conversation, products)


def portfolio() -> list[Spec]:
    """Three products: critical, medium and optimal (no stockout), in two units of measure."""
    return [
        Spec("QF-1001", "Ácido cítrico", "kg", stock=30.0, abc="A", censored=(1,)),
        Spec("QF-1002", "Glicerina vegetal", "kg", stock=70.0, abc="B", reliability="medium"),
        Spec(
            "QF-1003",
            "Bicarbonato de sodio",
            "l",
            stock=1000.0,
            abc="C",
            reliability="low",
            method="simple",
            wape_pct=None,
        ),
    ]
