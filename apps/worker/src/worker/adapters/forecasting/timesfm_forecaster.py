"""TimesFM adapter behind the Forecaster port.

Local experiments use TimesFM 3.0 (weights are NON-COMMERCIAL, never use in production):
`pip install "timesfm[mlx]"` on Apple Silicon, backend `timesfm3.mlx.TimesFM3Forecaster`.
Production uses TimesFM 2.5 (Apache-2.0 weights) or BigQuery ML, via other adapters.

Nothing heavy is imported or downloaded at import/construct time; weights load on first forecast.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from worker.domain.models import DemandSeries, Forecast

DEFAULT_CHECKPOINT = "google/timesfm-3.0-pytorch"
# TimesFM 3.0 returns 9 deciles (0.1 .. 0.9): index 0 = p10, 4 = p50, 8 = p90.
IDX_P10, IDX_P50, IDX_P90 = 0, 4, 8


class TimesFMForecaster:
    """`Forecaster` adapter using the TimesFM 3.0 MLX backend (Apple Silicon)."""

    def __init__(self, checkpoint: str = DEFAULT_CHECKPOINT, per_core_batch_size: int = 4) -> None:
        self._checkpoint = checkpoint
        self._batch_size = per_core_batch_size
        self._model: Any | None = None
        self.name = "timesfm-3.0-mlx"

    def _load(self) -> Any:
        if self._model is None:
            # Lazy (mlx + weights) and optional: only installed through `uv sync --group local`.
            from timesfm3.mlx import ModelConfig, TimesFM3Forecaster  # noqa: PLC0415  # ty: ignore[unresolved-import]

            self._model = TimesFM3Forecaster(
                ModelConfig(
                    checkpoint_path=self._checkpoint,
                    per_core_batch_size=self._batch_size,
                )
            )
        return self._model

    def warmup(self) -> None:
        """Load the weights now: a missing install or download fails at startup, not per product."""
        self._load()

    def forecast(self, series: DemandSeries, horizon: int) -> Forecast:
        model = self._load()
        context = np.asarray(series.y, dtype=np.float32)
        out = model.predict(context, horizon=horizon, return_quantiles=True, make_positive=True)
        q = np.asarray(out.quantiles)  # (horizon, 9)
        return Forecast(
            sku=series.sku,
            model=self.name,
            ds=series.future_dates(horizon),
            p10=q[:, IDX_P10].astype(float).tolist(),
            p50=q[:, IDX_P50].astype(float).tolist(),
            p90=q[:, IDX_P90].astype(float).tolist(),
        )
