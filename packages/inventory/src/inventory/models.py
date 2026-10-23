"""Value objects shared by the formulas. Quantities are in the product's unit of measure."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal

from inventory.errors import InvalidInputError


class Scenario(StrEnum):
    LOW = "low"
    EXPECTED = "expected"
    HIGH = "high"


@dataclass(frozen=True, slots=True)
class Demand:
    """Weekly demand per scenario, week 1 first. Invariant: low <= expected <= high."""

    low: tuple[float, ...]
    expected: tuple[float, ...]
    high: tuple[float, ...]

    def __post_init__(self) -> None:
        if not self.expected:
            raise InvalidInputError("demand needs at least one week")
        if not len(self.low) == len(self.expected) == len(self.high):
            raise InvalidInputError("low, expected and high demand must have the same length")
        if min(self.low) < 0:
            raise InvalidInputError("demand cannot be negative")
        if any(
            not lo <= mid <= hi
            for lo, mid, hi in zip(self.low, self.expected, self.high, strict=True)
        ):
            raise InvalidInputError("demand must satisfy low <= expected <= high in every week")

    @property
    def weeks(self) -> int:
        return len(self.expected)

    def series(self, scenario: Scenario) -> tuple[float, ...]:
        return {
            Scenario.LOW: self.low,
            Scenario.EXPECTED: self.expected,
            Scenario.HIGH: self.high,
        }[scenario]


@dataclass(frozen=True, slots=True)
class ScenarioProjection:
    """Week-by-week result for one demand scenario (index 0 is week 1)."""

    stock: tuple[float, ...]
    shortfall: tuple[float, ...]
    stockout_week: int | None
    coverage_weeks: float | None


class RiskLevel(StrEnum):
    CRITICAL = "critical"
    MEDIUM = "medium"
    OPTIMAL = "optimal"


@dataclass(frozen=True, slots=True)
class RiskThresholds:
    """Risk bands in weeks above the lead time (editable in Parámetros).

    critical: coverage < lead time + critical_margin_weeks
    medium:   coverage < lead time + medium_margin_weeks
    """

    critical_margin_weeks: float = 0.0
    medium_margin_weeks: float = 2.0

    def __post_init__(self) -> None:
        if self.critical_margin_weeks > self.medium_margin_weeks:
            raise InvalidInputError("critical margin cannot exceed the medium margin")


@dataclass(frozen=True, slots=True)
class ProductInputs:
    """Everything the formulas need for one product, in its unit of measure.

    `arrivals` maps a 1-based week to quantity already on order (week 1 is the week after
    `data_until`).
    """

    stock: float
    demand: Demand
    lead_time_days: int
    target_coverage_weeks: int
    arrivals: Mapping[int, float] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class QuantityRange:
    """A low-expected-high figure, for example the typical weekly demand."""

    low: float
    expected: float
    high: float


@dataclass(frozen=True, slots=True)
class CoverageRange:
    """Weeks of coverage per scenario.

    `lower` comes from high demand, `upper` from low demand. `None` means no stockout inside
    the horizon ("sin quiebre en el horizonte").
    """

    lower: float | None
    expected: float | None
    upper: float | None


@dataclass(frozen=True, slots=True)
class SuggestedQuantity:
    """Suggested purchase range. `truncated` is True when the horizon is shorter than
    lead time + target coverage, so the figure only covers the weeks available."""

    low: float
    high: float
    truncated: bool


@dataclass(frozen=True, slots=True)
class BuyBefore:
    """When to place the order.

    action: "order_today" (coverage is already below the lead time), "order_by_week" (place it
    before `week`, 1-based) or "no_stockout" (nothing needed inside the horizon).
    `earliest_week` is the bound from high demand (0 means today). `weeks_without_stock` is
    how long the product stays empty if the order is placed today.
    """

    action: Literal["order_today", "order_by_week", "no_stockout"]
    week: int | None
    earliest_week: int | None
    weeks_without_stock: float


@dataclass(frozen=True, slots=True)
class ProductAnalysis:
    """All derived figures for one product (section 6 spec table)."""

    lead_time_weeks: int
    low: ScenarioProjection
    expected: ScenarioProjection
    high: ScenarioProjection
    typical_demand: QuantityRange
    coverage: CoverageRange
    risk: RiskLevel
    suggested: SuggestedQuantity
    buy_before: BuyBefore
