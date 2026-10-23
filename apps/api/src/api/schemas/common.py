"""Figures shared by several resources. Quantities are in the product's unit of measure."""

from __future__ import annotations

from datetime import date

from pydantic import Field

from api.schemas.base import ApiModel
from api.schemas.enums import AbcClass, RiskLevel


class ScenarioValues(ApiModel):
    """One figure per demand scenario. For derived figures such as projected stock, `low` is the
    figure under low demand, so it is not necessarily the smallest value."""

    low: float
    expected: float
    high: float


class QuantityRange(ApiModel):
    """A low-high range, for example the suggested purchase."""

    low: float
    high: float


class CoverageRange(ApiModel):
    """Weeks of coverage. `lower` comes from high demand, `upper` from low demand; `null` means
    no stockout inside the horizon ("sin quiebre en el horizonte")."""

    lower: float | None
    expected: float | None
    upper: float | None


class FilterLink(ApiModel):
    """A figure that maps to a results filter. Omitted fields do not filter."""

    q: str | None = Field(default=None, max_length=120)
    risk: RiskLevel | None = None
    abc: AbcClass | None = None
    count: int = Field(ge=0)
    """How many products match the filter."""


class DateSpan(ApiModel):
    start: date
    end: date
