from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from worker.domain.models import Forecast


@runtime_checkable
class ForecastRepository(Protocol):
    """Persistence port for forecasts."""

    def save(self, forecasts: Sequence[Forecast]) -> None: ...

    def latest(self, sku: str, model: str) -> Forecast | None: ...
