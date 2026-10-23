"""Per-product forecasting: scenarios, fallback chain (R4), rolling backtest, reliability."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta

import pytest

from worker.adapters.forecasting import StatsForecastBaseline
from worker.application.forecasting import (
    Backtest,
    backtest,
    forecast_product,
    reliability,
)
from worker.domain.models import DemandSeries, Forecast
from worker.domain.results import DemandPoint, ProductDemand

START = date(2025, 1, 6)  # a Monday


def points(values: list[float], censored: set[int] | None = None) -> tuple[DemandPoint, ...]:
    flagged = censored or set()
    return tuple(
        DemandPoint(START + timedelta(weeks=i), v, i in flagged) for i, v in enumerate(values)
    )


def product(values: list[float], censored: set[int] | None = None) -> ProductDemand:
    return ProductDemand("A", "Producto A", "kg", points(values, censored), 100.0)


class Fake:
    """A forecaster whose output is a function of the training series."""

    name = "fake"

    def __init__(self, rule: Callable[[DemandSeries, int], tuple[list[float], ...]]) -> None:
        self.rule = rule
        self.seen: list[DemandSeries] = []

    def forecast(self, series: DemandSeries, horizon: int) -> Forecast:
        self.seen.append(series)
        p10, p50, p90 = self.rule(series, horizon)
        return Forecast(series.sku, self.name, series.future_dates(horizon), p10, p50, p90)


def last_value(series: DemandSeries, horizon: int) -> tuple[list[float], ...]:
    v = series.y[-1]
    return [v * 0.8] * horizon, [v] * horizon, [v * 1.2] * horizon


class TestBacktest:
    def test_a_perfect_naive_forecast_on_flat_demand_has_no_error(self) -> None:
        result = backtest(points([10.0] * 20), Fake(last_value))

        assert result == Backtest(wape=0.0, folds=3)

    def test_error_is_absolute_error_over_actual_demand(self) -> None:
        values = [10.0] * 16 + [20.0, 20.0, 20.0, 20.0]  # the last fold's actuals jump
        fake = Fake(lambda s, h: ([0.0] * h, [10.0] * h, [20.0] * h))  # always predicts 10

        result = backtest(points(values), fake)

        # folds at 8, 12 and 16 weeks of training: errors 0, 0, 4*10 over actuals 40, 40, 80
        assert result.folds == 3
        assert result.wape == pytest.approx(40 / 160)

    @pytest.mark.parametrize(("weeks", "folds"), [(20, 3), (16, 2), (12, 1), (11, 0), (5, 0)])
    def test_folds_need_at_least_eight_training_weeks(self, weeks: int, folds: int) -> None:
        result = backtest(points([10.0] * weeks), Fake(last_value))

        assert result.folds == folds
        assert (result.wape is None) == (folds == 0)

    def test_censored_actual_weeks_are_not_scored(self) -> None:
        values = [10.0] * 16 + [0.0, 10.0, 10.0, 10.0]  # a stockout week reads as zero demand
        fake = Fake(lambda s, h: ([0.0] * h, [10.0] * h, [20.0] * h))

        result = backtest(points(values, censored={16}), fake)

        assert result.wape == 0.0

    def test_training_series_are_imputed_before_fitting(self) -> None:
        values = [10.0, 10.0, 0.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0]
        fake = Fake(last_value)

        backtest(points(values, censored={2}), fake)

        assert fake.seen[0].y[2] == 10.0  # lifted from 0 to the typical level

    def test_all_zero_actuals_cannot_be_scored(self) -> None:
        assert backtest(points([0.0] * 20), Fake(last_value)).wape is None

    def test_a_forecaster_that_fails_a_fold_skips_it(self) -> None:
        calls = 0

        def flaky(series: DemandSeries, horizon: int) -> tuple[list[float], ...]:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise ValueError("fit failed")
            return last_value(series, horizon)

        result = backtest(points([10.0] * 20), Fake(flaky))

        assert result.folds == 2


class TestReliability:
    @pytest.mark.parametrize(
        ("method", "wape", "expected"),
        [
            ("model", 0.0, "high"),
            ("model", 0.30, "high"),
            ("model", 0.31, "medium"),
            ("model", 0.50, "medium"),
            ("model", 0.51, "low"),
            ("model", None, "low"),
            ("simple", 0.05, "low"),  # the simple method is never better than "Baja"
        ],
    )
    def test_thresholds_and_the_simple_method_cap(
        self, method: str, wape: float | None, expected: str
    ) -> None:
        assert reliability(method, Backtest(wape, 3 if wape is not None else 0)) == expected


class TestForecastProduct:
    def test_quantiles_become_the_three_scenarios(self) -> None:
        fake = Fake(lambda s, h: ([8.0] * h, [10.0] * h, [14.0] * h))

        result = forecast_product(product([10.0] * 30), 12, fake)

        assert result.method == "model"
        assert result.forecaster == "fake"
        assert result.demand.low == (8.0,) * 12
        assert result.demand.expected == (10.0,) * 12
        assert result.demand.high == (14.0,) * 12

    def test_crossed_or_negative_quantiles_are_repaired(self) -> None:
        fake = Fake(lambda s, h: ([12.0] * h, [10.0] * h, [-3.0] * h))

        demand = forecast_product(product([10.0] * 30), 8, fake).demand

        assert all(
            lo <= mid <= hi
            for lo, mid, hi in zip(demand.low, demand.expected, demand.high, strict=True)
        )
        assert min(demand.low) >= 0

    def test_a_censored_history_is_imputed_before_it_reaches_the_model(self) -> None:
        values = [10.0] * 30
        values[10] = 0.0
        fake = Fake(last_value)

        forecast_product(product(values, censored={10}), 12, fake)

        assert fake.seen[0].y[10] == 10.0
        assert fake.seen[0].censored[10]

    def test_under_eight_clean_weeks_use_the_simple_method_without_calling_the_model(self) -> None:
        fake = Fake(last_value)

        result = forecast_product(product([4.0, 6.0, 5.0, 5.0, 5.0]), 12, fake)

        assert result.method == "simple"
        assert result.forecaster == "simple-mean"
        assert result.demand.expected == (5.0,) * 12
        assert fake.seen == []
        assert result.backtest is None

    def test_censored_weeks_do_not_count_towards_the_minimum_history(self) -> None:
        values = [10.0] * 10
        fake = Fake(last_value)

        result = forecast_product(product(values, censored={0, 1, 2, 3}), 12, fake)

        assert result.method == "simple"  # only six clean weeks

    def test_a_failing_model_falls_back_to_the_simple_method(self) -> None:
        def boom(series: DemandSeries, horizon: int) -> tuple[list[float], ...]:
            raise ArithmeticError("singular matrix")

        result = forecast_product(product([10.0] * 30), 12, Fake(boom))

        assert result.method == "simple"
        assert result.forecaster == "simple-mean"
        assert result.demand.expected == (10.0,) * 12

    def test_a_history_that_is_entirely_censored_still_gets_a_simple_forecast(self) -> None:
        result = forecast_product(product([3.0, 4.0], censored={0, 1}), 8, Fake(last_value))

        assert result.method == "simple"
        assert result.demand.expected == (3.5,) * 8

    def test_the_backtest_is_attached_to_model_forecasts(self) -> None:
        result = forecast_product(product([10.0] * 30), 12, Fake(last_value))

        assert result.backtest == Backtest(wape=0.0, folds=3)


def test_real_autoets_produces_ordered_non_negative_scenarios() -> None:
    values = [20.0 + (i % 4) * 5 + (i // 10) for i in range(40)]

    result = forecast_product(
        product(values), 12, StatsForecastBaseline("auto_ets", season_length=1)
    )

    assert result.method == "model"
    assert result.forecaster == "statsforecast-auto-ets"
    assert len(result.demand.expected) == 12
    assert all(
        lo <= mid <= hi
        for lo, mid, hi in zip(
            result.demand.low, result.demand.expected, result.demand.high, strict=True
        )
    )
    assert result.backtest is not None
    assert result.backtest.folds == 3
