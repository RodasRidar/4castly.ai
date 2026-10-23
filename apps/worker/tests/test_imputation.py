from worker.application.imputation import impute_censored


def test_censored_weeks_are_raised_to_the_typical_demand_never_lowered() -> None:
    y = [10.0, 12.0, 11.0, 2.0, 13.0, 40.0]
    censored = [False, False, False, True, False, True]

    result = impute_censored(y, censored)

    assert result[:3] == [10.0, 12.0, 11.0]
    assert result[3] == 11.5  # the median of the observed weeks (10, 11, 12, 13)
    assert result[4] == 13.0
    assert result[5] == 40.0  # observed already above the typical level: kept


def test_nothing_changes_without_censoring() -> None:
    assert impute_censored([1.0, 2.0], [False, False]) == [1.0, 2.0]


def test_all_censored_leaves_the_series_alone() -> None:
    assert impute_censored([1.0, 2.0], [True, True]) == [1.0, 2.0]


def test_zero_weeks_do_not_drag_the_typical_level_down() -> None:
    y = [0.0, 0.0, 10.0, 12.0, 0.0]
    censored = [False, False, False, False, True]

    assert impute_censored(y, censored)[4] == 11.0  # median of the positive observed weeks
