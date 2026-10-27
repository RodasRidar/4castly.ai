"""The assistant's tools (plan 7c): read-only views of one run, run as the signed-in user.

The run is fixed by the server, never by the model, and every query goes through the same tenant
transaction (RLS) as the REST endpoints. Every number comes back as a figure with an id; plain
strings (risk levels, actions) carry no quantity. Failures are error results the model can phrase,
never exceptions and never internal detail.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated, Any, Literal
from uuid import UUID

import structlog
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from api.assistant.figures import Figure, FigureKind, ProductRef, Refs
from api.auth import Tx
from api.domain.errors import AppError, NotFoundError
from api.schemas import FilterLink, ProductRow, SimulationRequest
from api.schemas.enums import AbcClass, ProductSort, RiskLevel, SortOrder
from api.services import (
    run_parameters,  # noqa: F401 - keeps the module import order stable
    run_product_detail,
    run_products,
    runs,
)
from api.services.run_data import load_run

ProductCode = Annotated[str, Field(min_length=1, max_length=64)]
FIGURE_RULE = "Write every number you mention as its id in double square brackets, e.g. [[f7_3]]."


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NoInput(_Input):
    pass


class FindProductsInput(_Input):
    query: Annotated[str, Field(max_length=120)] | None = None
    risk: Literal["critical", "medium", "optimal"] | None = None
    abc: Literal["A", "B", "C"] | None = None
    sort: Literal[
        "risk", "coverage", "suggested_quantity", "current_stock", "typical_demand", "name"
    ] = "risk"
    order: Literal["asc", "desc"] = "asc"
    limit: Annotated[int, Field(ge=1, le=10, description="How many products (1 to 10).")] = 5


class ProductInput(_Input):
    code: ProductCode


class SimulateInput(_Input):
    code: ProductCode
    lead_time_days: Annotated[int, Field(ge=1, le=365)] | None = None
    target_coverage_weeks: Annotated[int, Field(ge=0, le=52)] | None = None
    with_purchase: bool = False
    purchase_quantity: Annotated[float, Field(ge=0)] | None = None


# Strict tool schemas reject these (the API answers 400); the Pydantic models still enforce them.
_UNSUPPORTED = frozenset(
    {
        "title", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
        "minLength", "maxLength", "pattern", "minItems", "maxItems", "format",
    }
)  # fmt: skip


def _clean(node: Any) -> Any:
    if isinstance(node, dict):
        return {
            k: ({name: _clean(sub) for name, sub in v.items()} if k == "properties" else _clean(v))
            for k, v in node.items()
            if k not in _UNSUPPORTED
        }
    if isinstance(node, list):
        return [_clean(v) for v in node]
    return node


def _schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = _clean(model.model_json_schema())
    schema.setdefault("properties", {})
    return schema


def _spec(name: str, description: str, model: type[BaseModel]) -> dict[str, Any]:
    return {
        "name": name,
        "description": f"{description} {FIGURE_RULE}",
        "input_schema": _schema(model),
        "strict": True,
    }


TOOL_SPECS: tuple[dict[str, Any], ...] = (
    _spec(
        "get_run_summary",
        "Portfolio overview of the current results: product counts by risk, average coverage, "
        "data date, reliability and whether defaults were used.",
        NoInput,
    ),
    _spec(
        "find_products",
        "List products of the current results with filters (risk, ABC class, text search) and "
        "sorting. Returns the matching total plus up to 10 products.",
        FindProductsInput,
    ),
    _spec(
        "get_product_detail",
        "Full card of one product: stock, coverage, stockout date, suggested purchase, when to "
        "order, lead time and reliability.",
        ProductInput,
    ),
    _spec(
        "simulate_purchase",
        "What-if for one product: a different lead time or target coverage, and optionally a "
        "purchase (default: the suggested minimum) arriving at the lead time. Nothing is saved.",
        SimulateInput,
    ),
    _spec(
        "get_parameters",
        "The parameters of the current results: horizon, lead time, target coverage and risk "
        "margins.",
        NoInput,
    ),
    _spec(
        "explain_reliability",
        "Why a product's forecast is high, medium or low reliability: method, history length and "
        "backtest error.",
        ProductInput,
    ),
)


class Toolbox:
    """Executes the tools of one turn for one run."""

    def __init__(self, tx: Tx, run_id: UUID, refs: Refs) -> None:
        self._tx, self._run_id, self._refs = tx, run_id, refs
        self._handlers: dict[str, tuple[type[BaseModel], Callable[[Any], Awaitable[dict]]]] = {
            "get_run_summary": (NoInput, self._summary),
            "find_products": (FindProductsInput, self._find),
            "get_product_detail": (ProductInput, self._detail),
            "simulate_purchase": (SimulateInput, self._simulate),
            "get_parameters": (NoInput, self._parameters),
            "explain_reliability": (ProductInput, self._reliability),
        }

    async def execute(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        entry = self._handlers.get(name)
        if entry is None:
            return {"error": "unknown_tool"}
        model, handler = entry
        try:
            return await handler(model.model_validate(arguments))
        except ValidationError:
            return {"error": "invalid_input"}
        except NotFoundError:
            return {"error": "not_found"}
        except AppError:
            return {"error": "tool_failed"}
        except Exception:
            structlog.get_logger().exception("assistant.tool_failed", tool=name)
            return {"error": "tool_failed"}

    async def _stock_known(self) -> bool:
        async def load(session: Any, who: Any) -> bool:  # noqa: ARG001
            return (await load_run(session, self._run_id)).stock_known

        return await self._tx.run(load)

    # -- figure helpers ------------------------------------------------------------------------
    def _fig(self, value: float | int | Any, kind: FigureKind, label: str, **kw: Any) -> dict:
        return self._refs.figure(value, kind, label=label, **kw).for_model()

    def _maybe(self, value: Any, kind: FigureKind, label: str, **kw: Any) -> dict | None:
        return None if value is None else self._fig(value, kind, label, **kw)

    def _product(self, row: ProductRow) -> ProductRef:
        return self._refs.product(row.code, row.name)

    def _demand_card(self, row: ProductRow) -> dict[str, Any]:
        """Without stock (D17) all there is: demand and how far to trust the forecast."""
        return {
            "product": self._product(row).for_model(),
            "abc": row.abc_class.value,
            "reliability": row.reliability.value,
            "typical_demand": self._fig(
                row.typical_demand.expected,
                FigureKind.QUANTITY,
                "typical weekly demand",
                uom=row.uom,
            ),
        }

    def _card(self, row: ProductRow) -> dict[str, Any]:
        if (
            row.risk is None
            or row.buy_before is None
            or row.coverage_weeks is None
            or row.suggested_quantity is None
            or row.current_stock is None
        ):
            return self._demand_card(row)
        buy = row.buy_before
        return {
            "product": self._product(row).for_model(),
            "abc": row.abc_class.value,
            "risk": row.risk.value,
            "reliability": row.reliability.value,
            "current_stock": self._fig(
                row.current_stock, FigureKind.QUANTITY, "current stock", uom=row.uom
            ),
            "coverage_weeks": self._maybe(
                row.coverage_weeks.expected, FigureKind.WEEKS, "coverage"
            ),
            "no_stockout_in_horizon": row.coverage_weeks.expected is None,
            "stockout_date": self._maybe(row.stockout_date, FigureKind.DATE, "stockout date"),
            "suggested_min": self._fig(
                row.suggested_quantity.low,
                FigureKind.QUANTITY,
                "suggested purchase (min)",
                uom=row.uom,
            ),
            "suggested_max": self._fig(
                row.suggested_quantity.high,
                FigureKind.QUANTITY,
                "suggested purchase (max)",
                uom=row.uom,
            ),
            "suggested_truncated": row.suggested_truncated,
            "buy_before": {
                "action": buy.action.value,
                "date": self._maybe(buy.date, FigureKind.DATE, "order before"),
            },
            "lead_time_days": self._fig(row.lead_time_days, FigureKind.DAYS, "lead time"),
            "target_coverage_weeks": self._fig(
                row.target_coverage_weeks, FigureKind.WEEKS, "target coverage"
            ),
            "on_order": self._fig(
                row.on_order_quantity, FigureKind.QUANTITY, "on order", uom=row.uom
            ),
        }

    # -- tools ---------------------------------------------------------------------------------
    async def _summary(self, _: NoInput) -> dict:
        summary = await self._tx.run(runs.get_summary, self._run_id)
        count = FigureKind.COUNT
        dist = summary.risk_distribution
        coverage = (
            summary.kpis.average_coverage_weeks.expected
            if summary.kpis.average_coverage_weeks
            else None
        )

        def risk(level: RiskLevel, value: int) -> dict:
            link = FilterLink(risk=level, count=value)
            return self._fig(value, count, f"{level.value} products", filter=link)

        reliability = summary.kpis.reliability
        if not summary.stock_known:  # no risk and no coverage to report without stock (D17)
            return {
                "total_products": self._fig(
                    summary.total_products, count, "products in the results"
                ),
                "data_until": self._fig(summary.run.data_until, FigureKind.DATE, "data until"),
                "stale": summary.run.stale,
                "stock_known": False,
                "defaults_used": [d.value for d in summary.run.defaults_used],
                "reliability_overall": reliability.overall.value,
                "high_reliability_products": self._fig(
                    reliability.distribution.high, count, "high reliability products"
                ),
                "low_reliability_products": self._fig(
                    reliability.distribution.low, count, "low reliability products"
                ),
            }
        assert dist is not None  # noqa: S101 - known stock always has a distribution
        return {
            "total_products": self._fig(summary.total_products, count, "products in the results"),
            "critical_products": risk(RiskLevel.CRITICAL, dist.critical),
            "medium_products": risk(RiskLevel.MEDIUM, dist.medium),
            "optimal_products": risk(RiskLevel.OPTIMAL, dist.optimal),
            "average_coverage_weeks": self._maybe(
                coverage, FigureKind.WEEKS, "average coverage (lower bound when no stockout)"
            ),
            "data_until": self._fig(summary.run.data_until, FigureKind.DATE, "data until"),
            "stale": summary.run.stale,
            "stock_known": summary.stock_known,
            "defaults_used": [d.value for d in summary.run.defaults_used],
            "reliability_overall": reliability.overall.value,
            "high_reliability_products": self._fig(
                reliability.distribution.high, count, "high reliability products"
            ),
            "low_reliability_products": self._fig(
                reliability.distribution.low, count, "low reliability products"
            ),
        }

    async def _find(self, args: FindProductsInput) -> dict:
        if args.risk and not await self._stock_known():
            return {"error": "stock_unknown"}
        page = await self._tx.run(
            run_products.list_products,
            self._run_id,
            args.query,
            [RiskLevel(args.risk)] if args.risk else None,
            [AbcClass(args.abc)] if args.abc else None,
            ProductSort(args.sort),
            SortOrder(args.order),
            1,
            args.limit,
        )
        link = FilterLink(q=args.query, risk=args.risk, abc=args.abc, count=page.total)
        return {
            "total_matching": self._fig(
                page.total, FigureKind.COUNT, "matching products", filter=link
            ),
            "products": [self._brief(row) for row in page.items],
        }

    def _brief(self, row: ProductRow) -> dict[str, Any]:
        card = self._card(row)
        for key in ("target_coverage_weeks", "on_order", "suggested_truncated", "lead_time_days"):
            card.pop(key, None)
        return card

    async def _detail(self, args: ProductInput) -> dict:
        detail = await self._tx.run(run_product_detail.get_detail, self._run_id, args.code)
        card = self._card(detail.product)
        if "typical_demand" not in card:
            card["typical_demand"] = self._fig(
                detail.product.typical_demand.expected,
                FigureKind.QUANTITY,
                "typical weekly demand",
                uom=detail.product.uom,
            )
        card["reliability_level"] = detail.reliability.level.value
        card["method"] = detail.reliability.method.value
        card["history_weeks"] = self._fig(
            detail.reliability.history_weeks, FigureKind.COUNT, "weeks of history"
        )
        card["backtest_error_pct"] = self._maybe(
            detail.reliability.backtest_error_pct, FigureKind.PERCENT, "backtest error"
        )
        return card

    async def _simulate(self, args: SimulateInput) -> dict:
        if not await self._stock_known():
            return {"error": "stock_unknown"}
        body = SimulationRequest(
            lead_time_days=args.lead_time_days,
            target_coverage_weeks=args.target_coverage_weeks,
            with_purchase=args.with_purchase,
            purchase_quantity=args.purchase_quantity,
        )
        result = await self._tx.run(run_product_detail.simulate, self._run_id, args.code, body)
        card = self._card(result.product)
        stockout_weeks = sum(w.status.value == "stockout" for w in result.projection.weekly)
        card["weeks_in_stockout"] = self._fig(stockout_weeks, FigureKind.COUNT, "weeks in stockout")
        card["arrivals"] = [
            {
                "date": self._fig(a.date, FigureKind.DATE, "arrival date"),
                "quantity": self._fig(
                    a.quantity, FigureKind.QUANTITY, "arriving quantity", uom=result.product.uom
                ),
            }
            for a in result.projection.arrivals
        ]
        card["simulation"] = True
        return card

    async def _parameters(self, _: NoInput) -> dict:
        async def load(session: Any, who: Any) -> Any:  # noqa: ARG001
            return await load_run(session, self._run_id)

        info = await self._tx.run(load)
        p = info.current()
        weeks, days = FigureKind.WEEKS, FigureKind.DAYS
        return {
            "horizon_weeks": self._fig(p.horizon_weeks, weeks, "forecast horizon"),
            "lead_time_days": self._fig(p.lead_time_days, days, "default lead time"),
            "target_coverage_weeks": self._fig(p.target_coverage_weeks, weeks, "target coverage"),
            "critical_margin_weeks": self._fig(
                p.risk_thresholds.critical_margin_weeks, weeks, "critical margin over lead time"
            ),
            "medium_margin_weeks": self._fig(
                p.risk_thresholds.medium_margin_weeks, weeks, "medium margin over lead time"
            ),
            "assistant_style": p.assistant_style.value,
            "parameters_pending": info.parameters_pending,
        }

    async def _reliability(self, args: ProductInput) -> dict:
        detail = await self._tx.run(run_product_detail.get_detail, self._run_id, args.code)
        r = detail.reliability
        return {
            "product": self._product(detail.product).for_model(),
            "level": r.level.value,
            "method": r.method.value,
            "history_weeks": self._fig(r.history_weeks, FigureKind.COUNT, "weeks of history"),
            "non_censored_weeks": self._fig(
                r.non_censored_weeks, FigureKind.COUNT, "weeks without stockout"
            ),
            "backtest_error_pct": self._maybe(
                r.backtest_error_pct, FigureKind.PERCENT, "backtest error"
            ),
        }


__all__ = ["TOOL_SPECS", "Figure", "Toolbox"]
