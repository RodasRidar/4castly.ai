import os
from datetime import date, timedelta

import pytest

from worker.adapters.forecasting import StatsForecastBaseline, TimesFMForecaster
from worker.domain.models import DemandSeries
from worker.ports import Forecaster


def _weekly_pattern_series(days: int = 120) -> DemandSeries:
    start = date(2025, 1, 6)  # Monday
    pattern = [10.0, 12.0, 14.0, 12.0, 20.0, 5.0, 0.0]
    return DemandSeries(
        sku="A001",
        freq="daily",
        ds=[start + timedelta(days=i) for i in range(days)],
        y=[pattern[i % 7] for i in range(days)],
    )


@pytest.mark.parametrize("model", ["seasonal_naive", "auto_ets"])
def test_baseline_forecast_shape_and_ordering(model) -> None:
    series = _weekly_pattern_series()
    forecast = StatsForecastBaseline(model=model).forecast(series, horizon=14)

    assert forecast.sku == "A001"
    assert forecast.ds == series.future_dates(14)
    assert len(forecast.p50) == 14
    assert all(
        lo <= mid <= hi
        for lo, mid, hi in zip(forecast.p10, forecast.p50, forecast.p90, strict=True)
    )
    assert all(v >= 0 for v in forecast.p10)


def test_seasonal_naive_repeats_weekly_pattern() -> None:
    series = _weekly_pattern_series()
    forecast = StatsForecastBaseline("seasonal_naive").forecast(series, horizon=7)
    expected = [series.y[len(series.y) - 7 + i] for i in range(7)]
    assert forecast.p50 == pytest.approx(expected)


def test_baseline_rejects_too_short_history() -> None:
    short = DemandSeries(sku="X", freq="daily", ds=[date(2025, 1, 1)], y=[1.0])
    with pytest.raises(ValueError, match="Need at least"):
        StatsForecastBaseline().forecast(short, horizon=3)


def test_adapters_satisfy_forecaster_port() -> None:
    # Construction must not import timesfm nor load weights.
    assert isinstance(StatsForecastBaseline(), Forecaster)
    assert isinstance(TimesFMForecaster(), Forecaster)


@pytest.mark.skipif(
    os.environ.get("RUN_TIMESFM") != "1",
    reason="set RUN_TIMESFM=1 to download weights and run TimesFM",
)
def test_timesfm_forecast_runs() -> None:
    series = _weekly_pattern_series()
    forecast = TimesFMForecaster().forecast(series, horizon=14)
    assert len(forecast.p50) == 14
    assert all(lo <= hi for lo, hi in zip(forecast.p10, forecast.p90, strict=True))
