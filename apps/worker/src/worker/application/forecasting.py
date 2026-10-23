"""Per-product forecasting with the R4 fallback chain, a rolling backtest and reliability.

The run never fails because of one product: a model that cannot fit falls back to the simple method,
and the reliability label says so (plan 6b, 12 R4).
"""

from __future__ import annotations

from dataclasses import dataclass

import inventory as inv
import structlog

from worker.application.imputation import impute_censored
from worker.domain.models import DemandSeries
from worker.domain.results import DemandPoint, ProductDemand
from worker.ports.forecaster import Forecaster

SIMPLE_NAME = "simple-mean"
MIN_TRAIN_WEEKS = 8
BACKTEST_HORIZON = 4
BACKTEST_FOLDS = 3
# Provisional thresholds (D13): to be re-set once more clients' backtests exist.
HIGH_WAPE = 0.30
MEDIUM_WAPE = 0.50


@dataclass(frozen=True)
class Backtest:
    wape: float | None
    """Weighted absolute percentage error over the scored weeks; None when it cannot be scored."""
    folds: int


@dataclass(frozen=True)
class ForecastedProduct:
    method: str  # model | simple
    forecaster: str
    demand: inv.Demand
    backtest: Backtest | None


def _series(code: str, points: tuple[DemandPoint, ...]) -> DemandSeries:
    y = impute_censored([p.demand for p in points], [p.censored for p in points])
    return DemandSeries(
        sku=code,
        freq="weekly",
        ds=[p.period for p in points],
        y=y,
        censored=[p.censored for p in points],
    )


def backtest(
    points: tuple[DemandPoint, ...], forecaster: Forecaster, code: str = "backtest"
) -> Backtest:
    """Rolling origin: train up to a cut, forecast the next weeks, score them against what sold.

    Training series are imputed like the real one; censored actual weeks are not scored, because a
    stockout reads as low demand and would punish a good forecast.
    """
    n = len(points)
    error = actual = 0.0
    folds = 0
    for k in range(BACKTEST_FOLDS):
        cut = n - BACKTEST_HORIZON * (BACKTEST_FOLDS - k)
        if cut < MIN_TRAIN_WEEKS:
            continue
        try:
            forecast = forecaster.forecast(_series(code, points[:cut]), BACKTEST_HORIZON)
        except Exception as failure:
            structlog.get_logger().warning("backtest.fold_failed", error=type(failure).__name__)
            continue
        folds += 1
        for point, predicted in zip(
            points[cut : cut + BACKTEST_HORIZON], forecast.p50, strict=False
        ):
            if not point.censored:
                error += abs(point.demand - predicted)
                actual += point.demand
    return Backtest(error / actual if actual > 0 else None, folds)


def reliability(method: str, result: Backtest) -> str:
    """Alta / Media / Baja from the backtest error; the simple method is never better than Baja."""
    if method != "model" or result.wape is None:
        return "low"
    if result.wape <= HIGH_WAPE:
        return "high"
    return "medium" if result.wape <= MEDIUM_WAPE else "low"


def _simple(demand: ProductDemand, horizon: int) -> ForecastedProduct:
    observed = [p.demand for p in demand.points if not p.censored]
    values = observed or [p.demand for p in demand.points]
    return ForecastedProduct("simple", SIMPLE_NAME, inv.simple_demand(values, horizon), None)


def forecast_product(
    demand: ProductDemand, horizon: int, forecaster: Forecaster
) -> ForecastedProduct:
    clean_weeks = sum(not p.censored for p in demand.points)
    if inv.select_method(clean_weeks) is inv.Method.SIMPLE:
        return _simple(demand, horizon)
    try:
        forecast = forecaster.forecast(_series(demand.code, demand.points), horizon)
    except Exception as failure:
        structlog.get_logger().warning(
            "forecast.model_failed", product=demand.code, error=type(failure).__name__
        )
        return _simple(demand, horizon)
    scenarios = inv.Demand(
        low=tuple(
            max(0.0, min(lo, mid)) for lo, mid in zip(forecast.p10, forecast.p50, strict=True)
        ),
        expected=tuple(max(0.0, mid) for mid in forecast.p50),
        high=tuple(max(0.0, mid, hi) for mid, hi in zip(forecast.p50, forecast.p90, strict=True)),
    )
    return ForecastedProduct(
        "model", forecaster.name, scenarios, backtest(demand.points, forecaster, demand.code)
    )
