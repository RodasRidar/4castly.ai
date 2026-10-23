"""Risk, typical demand, suggested quantity, buy-before and the composed analysis (section 6)."""

from datetime import date

import pytest

from inventory import (
    Demand,
    InvalidInputError,
    ProductInputs,
    RiskLevel,
    RiskThresholds,
    analyze_product,
    classify_risk,
    is_stale,
    typical_weekly_demand,
    week_start,
    with_purchase,
)

EXPECTED = (310.0, 300.0, 320.0, 310.0, 300.0, 310.0)


def demand_around(expected: tuple[float, ...], band: float = 40.0) -> Demand:
    return Demand(
        low=tuple(d - band for d in expected),
        expected=expected,
        high=tuple(d + band for d in expected),
    )


def worked_vector(
    *,
    stock: float = 290.0,
    demand: Demand | None = None,
    lead_time_days: int = 14,
    target_coverage_weeks: int = 4,
    arrivals: dict[int, float] | None = None,
) -> ProductInputs:
    return ProductInputs(
        stock=stock,
        demand=demand or demand_around(EXPECTED),
        lead_time_days=lead_time_days,
        target_coverage_weeks=target_coverage_weeks,
        arrivals=arrivals or {},
    )


class TestWorkedVector:
    """The test vector of section 6, verbatim."""

    def test_stock_and_shortfall(self) -> None:
        analysis = analyze_product(worked_vector())

        assert analysis.expected.stock == (0.0,) * 6
        assert analysis.expected.shortfall[0] == 20.0

    def test_coverage_and_risk(self) -> None:
        analysis = analyze_product(worked_vector())

        assert analysis.lead_time_weeks == 2
        assert analysis.coverage.expected == pytest.approx(0.935, abs=0.005)
        assert analysis.risk is RiskLevel.CRITICAL

    def test_coverage_range_brackets_the_expected_value(self) -> None:
        coverage = analyze_product(worked_vector()).coverage

        assert coverage.lower == pytest.approx(290 / 350)  # high demand: lower bound
        assert coverage.upper == pytest.approx(1 + 20 / 260)  # low demand: upper bound
        assert coverage.lower is not None
        assert coverage.expected is not None
        assert coverage.upper is not None
        assert coverage.lower <= coverage.expected <= coverage.upper

    def test_suggested_quantity_range(self) -> None:
        suggested = analyze_product(worked_vector()).suggested

        assert suggested.low == 1560.0  # 1850 - 290
        assert suggested.high == 1640.0  # + 80 buffer over the lead time
        assert not suggested.truncated

    def test_buy_before_is_already_past_and_about_one_week_without_stock(self) -> None:
        buy_before = analyze_product(worked_vector()).buy_before

        assert buy_before.action == "order_today"
        assert buy_before.week is None
        assert buy_before.weeks_without_stock == pytest.approx(2 - 290 / 310)
        assert buy_before.earliest_week == 0

    def test_typical_demand_is_the_four_week_mean_with_range(self) -> None:
        typical = analyze_product(worked_vector()).typical_demand

        assert typical.expected == 310.0  # mean(310, 300, 320, 310)
        assert typical.low == 270.0
        assert typical.high == 350.0


class TestComfortableStock:
    def inputs(self) -> ProductInputs:
        return ProductInputs(
            stock=3000.0,
            demand=demand_around((300.0,) * 12),
            lead_time_days=14,
            target_coverage_weeks=4,
        )

    def test_optimal_risk_and_future_buy_before_week(self) -> None:
        analysis = analyze_product(self.inputs())

        assert analysis.coverage.expected == 10.0
        assert analysis.risk is RiskLevel.OPTIMAL
        assert analysis.buy_before.action == "order_by_week"
        assert analysis.buy_before.week == 9  # stockout in week 11, minus lead time 2
        assert analysis.buy_before.earliest_week == 7  # high demand stocks out in week 9
        assert analysis.buy_before.weeks_without_stock == 0.0

    def test_no_purchase_needed_still_reports_the_exposure_buffer(self) -> None:
        suggested = analyze_product(self.inputs()).suggested

        assert suggested.low == 0.0
        assert suggested.high == 80.0


def test_no_stockout_in_horizon_has_open_ended_coverage_and_no_buy_before() -> None:
    analysis = analyze_product(
        ProductInputs(
            stock=1000.0,
            demand=demand_around((10.0,) * 8, band=2.0),
            lead_time_days=14,
            target_coverage_weeks=4,
        )
    )

    assert analysis.coverage.expected is None
    assert analysis.risk is RiskLevel.OPTIMAL
    assert analysis.buy_before.action == "no_stockout"
    assert analysis.buy_before.week is None
    assert analysis.buy_before.earliest_week is None


def test_suggested_quantity_discounts_on_order_arrivals_inside_the_window() -> None:
    inputs = worked_vector(arrivals={3: 500.0, 9: 999.0})

    suggested = analyze_product(inputs).suggested

    assert suggested.low == 1850.0 - 290.0 - 500.0  # the week-9 arrival is outside H=6


def test_suggested_quantity_is_flagged_when_the_horizon_is_shorter_than_the_window() -> None:
    inputs = worked_vector(demand=demand_around(EXPECTED[:4]))

    suggested = analyze_product(inputs).suggested

    assert suggested.truncated
    assert suggested.low == 310 + 300 + 320 + 310 - 290.0


def test_suggested_quantity_is_never_negative() -> None:
    assert analyze_product(worked_vector(stock=1e6)).suggested.low == 0.0


def test_with_purchase_adds_the_order_at_the_lead_time_week() -> None:
    bought = with_purchase(worked_vector(arrivals={2: 10.0}), 1560.0)

    assert bought.arrivals == {2: 1570.0}
    analysis = analyze_product(bought)
    assert analysis.expected.shortfall == (20.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    assert analysis.expected.stock[-1] == 30.0


def test_a_purchase_sized_to_the_window_covers_it_exactly_without_float_noise() -> None:
    inputs = ProductInputs(
        stock=0.0,
        demand=demand_around((0.1,) * 4, band=0.0),
        lead_time_days=7,
        target_coverage_weeks=2,
    )
    quantity = analyze_product(inputs).suggested.low  # 3 weeks of 0.1, with float residue

    bought = analyze_product(with_purchase(inputs, quantity))

    assert bought.expected.shortfall[:3] == (0.0, 0.0, 0.0)
    assert bought.expected.stockout_week == 4  # the fourth week is genuinely uncovered


def test_with_purchase_rejects_negative_quantity() -> None:
    with pytest.raises(InvalidInputError):
        with_purchase(worked_vector(), -1.0)


@pytest.mark.parametrize(
    ("coverage", "expected"),
    [
        (0.0, RiskLevel.CRITICAL),
        (1.99, RiskLevel.CRITICAL),
        (2.0, RiskLevel.MEDIUM),
        (3.99, RiskLevel.MEDIUM),
        (4.0, RiskLevel.OPTIMAL),
        (None, RiskLevel.OPTIMAL),
    ],
)
def test_classify_risk_uses_lead_time_and_default_margins(
    coverage: float | None, expected: RiskLevel
) -> None:
    assert classify_risk(coverage, lead_time_weeks=2, horizon_weeks=12) is expected


def test_classify_risk_treats_missing_coverage_as_the_horizon_lower_bound() -> None:
    assert classify_risk(None, lead_time_weeks=7, horizon_weeks=8) is RiskLevel.MEDIUM


def test_classify_risk_honours_custom_thresholds() -> None:
    thresholds = RiskThresholds(critical_margin_weeks=1.0, medium_margin_weeks=4.0)

    assert classify_risk(2.5, 2, 12, thresholds) is RiskLevel.CRITICAL
    assert classify_risk(5.5, 2, 12, thresholds) is RiskLevel.MEDIUM


def test_risk_thresholds_reject_a_critical_margin_above_the_medium_margin() -> None:
    with pytest.raises(InvalidInputError):
        RiskThresholds(critical_margin_weeks=3.0, medium_margin_weeks=2.0)


def test_typical_weekly_demand_uses_available_weeks_when_fewer_than_four() -> None:
    typical = typical_weekly_demand(demand_around((100.0, 200.0), band=10.0))

    assert (typical.low, typical.expected, typical.high) == (140.0, 150.0, 160.0)


def test_negative_lead_time_and_coverage_are_rejected() -> None:
    with pytest.raises(InvalidInputError):
        analyze_product(worked_vector(lead_time_days=0))
    with pytest.raises(InvalidInputError):
        analyze_product(worked_vector(target_coverage_weeks=-1))


class TestCalendar:
    def test_data_older_than_seven_days_is_stale(self) -> None:
        today = date(2026, 10, 23)

        assert is_stale(date(2026, 10, 15), today)
        assert not is_stale(date(2026, 10, 16), today)

    @pytest.mark.parametrize(
        ("data_until", "week", "start"),
        [
            (date(2026, 10, 21), 1, date(2026, 10, 26)),  # Wednesday -> next Monday
            (date(2026, 10, 25), 1, date(2026, 10, 26)),  # Sunday -> next day
            (date(2026, 10, 26), 1, date(2026, 11, 2)),  # Monday -> Monday after
            (date(2026, 10, 21), 3, date(2026, 11, 9)),
        ],
    )
    def test_week_start_is_the_monday_of_the_week_after_data_until(
        self, data_until: date, week: int, start: date
    ) -> None:
        assert week_start(data_until, week) == start
