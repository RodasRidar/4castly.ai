"""Pure domain models. No I/O, no third-party dependencies."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal

Frequency = Literal["daily", "weekly"]

OPENING_BALANCE_TYPE = "SALDO INICIAL"


@dataclass(frozen=True, slots=True)
class Movement:
    """One inventory movement (one Kardex row)."""

    sku: str
    sku_name: str
    uom: str
    timestamp: datetime
    movement_code: str
    movement_type: str
    document: str
    counterparty: str
    qty_in: float
    qty_out: float
    balance: float | None

    @property
    def is_opening_balance(self) -> bool:
        return self.movement_type.strip().upper() == OPENING_BALANCE_TYPE


@dataclass(frozen=True, slots=True)
class DemandSeries:
    """Regular (zero-filled) demand history for one SKU.

    `censored[i]` is True when period i was affected by a stockout, so the observed
    demand is a lower bound of the true demand.
    """

    sku: str
    freq: Frequency
    ds: list[date]
    y: list[float]
    censored: list[bool] = field(default_factory=list)

    def __post_init__(self) -> None:
        if len(self.ds) != len(self.y):
            raise ValueError("ds and y must have the same length")
        if not self.censored:
            object.__setattr__(self, "censored", [False] * len(self.y))
        elif len(self.censored) != len(self.y):
            raise ValueError("censored and y must have the same length")

    @property
    def step(self) -> timedelta:
        return timedelta(days=1 if self.freq == "daily" else 7)

    def future_dates(self, horizon: int) -> list[date]:
        last = self.ds[-1]
        return [last + self.step * (i + 1) for i in range(horizon)]


@dataclass(frozen=True, slots=True)
class Forecast:
    """Probabilistic forecast for one SKU: p10 / p50 / p90 per future period."""

    sku: str
    model: str
    ds: list[date]
    p10: list[float]
    p50: list[float]
    p90: list[float]

    def __post_init__(self) -> None:
        n = len(self.ds)
        if not (len(self.p10) == len(self.p50) == len(self.p90) == n):
            raise ValueError("ds, p10, p50 and p90 must have the same length")
