from __future__ import annotations

from typing import Protocol, runtime_checkable

from worker.domain.models import DemandSeries, Forecast


@runtime_checkable
class Forecaster(Protocol):
    """Forecasting port. Adapters: TimesFM, statsforecast baseline, BigQuery ML..."""

    name: str

    def forecast(self, series: DemandSeries, horizon: int) -> Forecast: ...
