"""Stockout weeks understate demand (the product was missing): lift them before fitting a model."""

from __future__ import annotations

from collections.abc import Sequence
from statistics import median


def impute_censored(y: Sequence[float], censored: Sequence[bool]) -> list[float]:
    """Raise each censored week to the typical demand (median of the observed positive weeks).

    Observed demand is a lower bound in a censored week, so it is never lowered, and a week that
    already sold more than the typical level keeps its value.
    """
    observed = [v for v, c in zip(y, censored, strict=True) if not c and v > 0]
    if not observed:
        return list(y)
    typical = median(observed)
    return [max(v, typical) if c else v for v, c in zip(y, censored, strict=True)]
