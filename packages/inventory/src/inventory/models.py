"""Value objects shared by the formulas. Quantities are in the product's unit of measure."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

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
