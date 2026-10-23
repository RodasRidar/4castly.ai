"""Projection, shortfall, stockout and coverage (plan section 6, spec table)."""

import random

import pytest

from inventory import (
    Demand,
    InvalidInputError,
    Scenario,
    lead_time_weeks,
    project_scenario,
)

EXPECTED = (310.0, 300.0, 320.0, 310.0, 300.0, 310.0)
HIGH = tuple(d + 40 for d in EXPECTED)
LOW = tuple(d - 40 for d in EXPECTED)


def test_lead_time_weeks_rounds_up_to_whole_weeks() -> None:
    assert lead_time_weeks(14) == 2
    assert lead_time_weeks(15) == 3
    assert lead_time_weeks(1) == 1


@pytest.mark.parametrize("days", [0, -7])
def test_lead_time_weeks_rejects_non_positive_days(days: int) -> None:
    with pytest.raises(InvalidInputError):
        lead_time_weeks(days)


def test_worked_vector_projects_zero_stock_and_shortfall_in_week_one() -> None:
    projection = project_scenario(290.0, EXPECTED, {})

    assert projection.stock == (0.0,) * 6
    assert projection.shortfall[0] == 20.0
    assert projection.shortfall[1:] == EXPECTED[1:]
    assert projection.stockout_week == 1
    assert projection.coverage_weeks == pytest.approx(290 / 310)


def test_arrivals_extend_coverage_and_are_added_before_demand() -> None:
    projection = project_scenario(100.0, (100.0,) * 6, {2: 150.0})

    assert projection.stock == (0.0, 50.0, 0.0, 0.0, 0.0, 0.0)
    assert projection.shortfall == (0.0, 0.0, 50.0, 100.0, 100.0, 100.0)
    assert projection.stockout_week == 3
    assert projection.coverage_weeks == pytest.approx(2.5)


def test_no_stockout_in_horizon_has_no_coverage_figure() -> None:
    projection = project_scenario(1000.0, (10.0,) * 8, {})

    assert projection.stockout_week is None
    assert projection.coverage_weeks is None
    assert projection.shortfall == (0.0,) * 8
    assert projection.stock[-1] == 920.0


def test_float_residue_is_not_a_stockout() -> None:
    projection = project_scenario(0.3, (0.1, 0.1, 0.1), {})

    assert projection.stockout_week is None
    assert projection.coverage_weeks is None
    assert projection.shortfall == (0.0, 0.0, 0.0)
    assert projection.stock[-1] == 0.0


def test_zero_stock_stocks_out_in_week_one_with_zero_coverage() -> None:
    projection = project_scenario(0.0, EXPECTED, {})

    assert projection.stockout_week == 1
    assert projection.coverage_weeks == 0.0


def test_zero_demand_never_stocks_out() -> None:
    projection = project_scenario(0.0, (0.0,) * 4, {})

    assert projection.stockout_week is None
    assert projection.stock == (0.0,) * 4


def test_stock_is_never_negative() -> None:
    projection = project_scenario(5.0, (50.0, 50.0, 50.0), {})

    assert min(projection.stock) == 0.0


def test_arrivals_past_the_horizon_are_ignored() -> None:
    assert project_scenario(10.0, (5.0, 5.0), {3: 99.0}) == project_scenario(10.0, (5.0, 5.0), {})


@pytest.mark.parametrize("week", [0, -1])
def test_arrival_before_week_one_is_rejected(week: int) -> None:
    with pytest.raises(InvalidInputError):
        project_scenario(10.0, (5.0, 5.0), {week: 1.0})


def test_negative_stock_is_rejected() -> None:
    with pytest.raises(InvalidInputError):
        project_scenario(-1.0, (5.0,), {})


def test_empty_horizon_is_rejected() -> None:
    with pytest.raises(InvalidInputError):
        project_scenario(1.0, (), {})


def test_coverage_is_ordered_low_expected_high_demand() -> None:
    low = project_scenario(290.0, LOW, {})
    expected = project_scenario(290.0, EXPECTED, {})
    high = project_scenario(290.0, HIGH, {})

    assert high.coverage_weeks is not None
    assert expected.coverage_weeks is not None
    assert low.coverage_weeks is not None
    assert high.coverage_weeks <= expected.coverage_weeks <= low.coverage_weeks


class TestDemand:
    def test_accepts_ordered_scenarios(self) -> None:
        demand = Demand(low=LOW, expected=EXPECTED, high=HIGH)

        assert demand.weeks == 6
        assert demand.series(Scenario.HIGH) == HIGH

    def test_rejects_unequal_lengths(self) -> None:
        with pytest.raises(InvalidInputError):
            Demand(low=LOW[:-1], expected=EXPECTED, high=HIGH)

    def test_rejects_unordered_scenarios(self) -> None:
        with pytest.raises(InvalidInputError):
            Demand(low=HIGH, expected=EXPECTED, high=LOW)

    def test_rejects_negative_demand(self) -> None:
        with pytest.raises(InvalidInputError):
            Demand(low=(-1.0,), expected=(1.0,), high=(2.0,))

    def test_rejects_empty_series(self) -> None:
        with pytest.raises(InvalidInputError):
            Demand(low=(), expected=(), high=())


def test_invariants_hold_on_random_inputs() -> None:
    rng = random.Random(7)  # noqa: S311 - seeded for reproducibility, not security
    for _ in range(300):
        weeks = rng.randint(1, 16)
        expected = tuple(rng.uniform(0, 500) for _ in range(weeks))
        demand = Demand(
            low=tuple(d * 0.8 for d in expected),
            expected=expected,
            high=tuple(d * 1.3 for d in expected),
        )
        stock = rng.uniform(0, 2000)
        arrivals = {rng.randint(1, weeks): rng.uniform(0, 800) for _ in range(rng.randint(0, 3))}

        runs = {s: project_scenario(stock, demand.series(s), arrivals) for s in Scenario}

        for run in runs.values():
            assert min(run.stock) >= 0
            assert min(run.shortfall) >= 0
            assert (run.stockout_week is None) == (run.coverage_weeks is None)
            if run.stockout_week is not None and run.coverage_weeks is not None:
                assert run.stockout_week - 1 <= run.coverage_weeks < run.stockout_week
        # More demand never leaves more stock than less demand.
        assert all(
            h <= e <= lo
            for h, e, lo in zip(
                runs[Scenario.HIGH].stock,
                runs[Scenario.EXPECTED].stock,
                runs[Scenario.LOW].stock,
                strict=True,
            )
        )
