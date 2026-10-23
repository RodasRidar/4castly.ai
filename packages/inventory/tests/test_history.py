"""Minimum history, offered horizons and the simple fallback method (section 6 rules)."""

import math

import pytest

from inventory import (
    HorizonOption,
    InvalidInputError,
    Method,
    available_horizons,
    select_method,
    simple_demand,
)


@pytest.mark.parametrize(
    ("weeks", "method"),
    [(0, Method.SIMPLE), (7, Method.SIMPLE), (8, Method.MODEL), (37, Method.MODEL)],
)
def test_under_eight_non_censored_weeks_use_the_simple_method(weeks: int, method: Method) -> None:
    assert select_method(weeks) is method


def test_horizon_is_offered_only_when_history_covers_twice_its_length() -> None:
    options = available_horizons(history_weeks=37)

    assert options == (
        HorizonOption(weeks=8, enabled=True, required_history_weeks=16),
        HorizonOption(weeks=12, enabled=True, required_history_weeks=24),
        HorizonOption(weeks=24, enabled=False, required_history_weeks=48),
    )


def test_history_exactly_twice_the_horizon_enables_it() -> None:
    enabled = {o.weeks: o.enabled for o in available_horizons(history_weeks=16)}

    assert enabled == {8: True, 12: False, 24: False}


def test_horizon_options_are_configurable() -> None:
    options = available_horizons(history_weeks=10, options=(4, 6))

    assert [o.weeks for o in options if o.enabled] == [4]


def test_simple_demand_is_the_observed_mean_with_a_one_deviation_band() -> None:
    demand = simple_demand([10.0, 20.0, 30.0], horizon_weeks=3)

    std = math.sqrt(200 / 3)
    assert demand.expected == (20.0,) * 3
    assert demand.low == pytest.approx((20.0 - std,) * 3)
    assert demand.high == pytest.approx((20.0 + std,) * 3)


def test_simple_demand_low_never_goes_below_zero() -> None:
    assert simple_demand([0.0, 0.0, 30.0], horizon_weeks=2).low == (0.0, 0.0)


def test_simple_demand_with_one_observation_has_a_degenerate_band() -> None:
    demand = simple_demand([5.0], horizon_weeks=2)

    assert demand.low == demand.expected == demand.high == (5.0, 5.0)


@pytest.mark.parametrize(("observed", "horizon"), [([], 4), ([1.0], 0), ([-1.0, 2.0], 4)])
def test_simple_demand_rejects_invalid_inputs(observed: list[float], horizon: int) -> None:
    with pytest.raises(InvalidInputError):
        simple_demand(observed, horizon_weeks=horizon)
