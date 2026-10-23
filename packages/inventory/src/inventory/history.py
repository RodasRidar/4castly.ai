"""History rules: minimum history, offered horizons and the simple fallback method."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from inventory.errors import InvalidInputError
from inventory.models import Demand

MIN_HISTORY_WEEKS = 8
HORIZON_OPTIONS = (8, 12, 24)
HISTORY_TO_HORIZON_RATIO = 2


class Method(StrEnum):
    MODEL = "model"
    SIMPLE = "simple"


@dataclass(frozen=True, slots=True)
class HorizonOption:
    """A forecast horizon the UI may offer; disabled ones carry the history they would need."""

    weeks: int
    enabled: bool
    required_history_weeks: int


def select_method(non_censored_weeks: int) -> Method:
    """Under 8 weeks of non-censored history only the simple method is trustworthy."""
    return Method.MODEL if non_censored_weeks >= MIN_HISTORY_WEEKS else Method.SIMPLE


def available_horizons(
    history_weeks: int, options: Sequence[int] = HORIZON_OPTIONS
) -> tuple[HorizonOption, ...]:
    """A horizon is offered only when the history covers at least twice its length."""
    return tuple(
        HorizonOption(
            weeks=weeks,
            enabled=history_weeks >= weeks * HISTORY_TO_HORIZON_RATIO,
            required_history_weeks=weeks * HISTORY_TO_HORIZON_RATIO,
        )
        for weeks in options
    )


def simple_demand(observed: Sequence[float], horizon_weeks: int) -> Demand:
    """Flat demand at the mean of the observed weeks, with a one standard deviation band.

    The band is the population deviation of the observed weeks; it keeps the output a range
    (never a single figure) while the reliability stays "Baja".
    """
    if not observed:
        raise InvalidInputError("the simple method needs at least one observed week")
    if horizon_weeks < 1:
        raise InvalidInputError("horizon must be at least one week")
    if min(observed) < 0:
        raise InvalidInputError("observed demand cannot be negative")
    mean = sum(observed) / len(observed)
    std = math.sqrt(sum((x - mean) ** 2 for x in observed) / len(observed))
    return Demand(
        low=(max(0.0, mean - std),) * horizon_weeks,
        expected=(mean,) * horizon_weeks,
        high=(mean + std,) * horizon_weeks,
    )
