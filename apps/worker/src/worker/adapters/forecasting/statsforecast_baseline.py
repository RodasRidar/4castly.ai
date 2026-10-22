"""Mandatory baseline: statsforecast SeasonalNaive / AutoETS behind the Forecaster port."""

from __future__ import annotations

from typing import Literal, cast

import pandas as pd

from worker.domain.models import DemandSeries, Forecast

BaselineModel = Literal["seasonal_naive", "auto_ets"]
_LEVEL = 80  # lo-80 / hi-80 == p10 / p90


class StatsForecastBaseline:
    """`Forecaster` adapter backed by statsforecast (fast, CPU only)."""

    def __init__(
        self, model: BaselineModel = "seasonal_naive", season_length: int | None = None
    ) -> None:
        self._model = model
        self._season_length = season_length
        self.name = f"statsforecast-{model.replace('_', '-')}"

    def forecast(self, series: DemandSeries, horizon: int) -> Forecast:
        # Lazy import keeps module import cheap (statsforecast pulls numba/scipy).
        from statsforecast import StatsForecast  # noqa: PLC0415
        from statsforecast.models import AutoETS, SeasonalNaive  # noqa: PLC0415

        season = self._season_length or (7 if series.freq == "daily" else 52)
        if len(series.y) < 2 * season:
            raise ValueError(
                f"Need at least {2 * season} observations for season_length={season}, "
                f"got {len(series.y)}"
            )
        pandas_freq = "D" if series.freq == "daily" else "W-MON"
        model = (
            SeasonalNaive(season_length=season)
            if self._model == "seasonal_naive"
            else AutoETS(season_length=season)
        )
        df = pd.DataFrame({"unique_id": series.sku, "ds": pd.to_datetime(series.ds), "y": series.y})
        sf = StatsForecast(models=[model], freq=pandas_freq, n_jobs=1)
        out = cast("pd.DataFrame", sf.forecast(df=df, h=horizon, level=[_LEVEL]))
        alias = model.alias
        p10 = out[f"{alias}-lo-{_LEVEL}"].clip(lower=0.0).tolist()
        p50 = out[alias].clip(lower=0.0).tolist()
        p90 = out[f"{alias}-hi-{_LEVEL}"].clip(lower=0.0).tolist()
        return Forecast(
            sku=series.sku,
            model=self.name,
            ds=series.future_dates(horizon),
            p10=p10,
            p50=p50,
            p90=p90,
        )
