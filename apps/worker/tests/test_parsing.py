"""Parsing rules of the plan executor (plan 6c): declared date format and decimal separator."""

from datetime import date, datetime

import pytest

from worker.adapters.ingestion.parsing import (
    detect_date_format,
    detect_decimal_separator,
    parse_date,
    parse_decimal,
)


class TestParseDecimal:
    @pytest.mark.parametrize(
        ("raw", "separator", "expected"),
        [
            ("1.850,5", ",", 1850.5),
            ("1,850.5", ".", 1850.5),
            ("320", ",", 320.0),
            ("12,5", ",", 12.5),
            ("12.5", ".", 12.5),
            ("-4,25", ",", -4.25),
            ("  7 ", ".", 7.0),
            (12, ",", 12.0),
            (3.5, ",", 3.5),
        ],
    )
    def test_uses_the_declared_separator(
        self, raw: object, separator: str, expected: float
    ) -> None:
        assert parse_decimal(raw, separator) == expected

    @pytest.mark.parametrize("raw", ["", "abc", "1.2.3,4,5", None, True, "12 kg"])
    def test_unparseable_values_are_none(self, raw: object) -> None:
        assert parse_decimal(raw, ",") is None


class TestParseDate:
    @pytest.mark.parametrize(
        ("raw", "fmt", "expected"),
        [
            ("12/01/2026", "dd/mm/yyyy", date(2026, 1, 12)),
            ("2026-01-12", "yyyy-mm-dd", date(2026, 1, 12)),
            ("12-01-2026", "dd-mm-yyyy", date(2026, 1, 12)),
            ("01/12/2026", "mm/dd/yyyy", date(2026, 1, 12)),
            ("12/01/26", "dd/mm/yy", date(2026, 1, 12)),
            (datetime(2026, 1, 12, 9, 30), "dd/mm/yyyy", date(2026, 1, 12)),
            (date(2026, 1, 12), "yyyy-mm-dd", date(2026, 1, 12)),
        ],
    )
    def test_parses_with_the_declared_format(self, raw: object, fmt: str, expected: date) -> None:
        assert parse_date(raw, fmt) == expected

    @pytest.mark.parametrize("raw", ["", "32/01/2026", "12/13/2026", "hola", None, 45678])
    def test_invalid_dates_are_none_and_never_guessed(self, raw: object) -> None:
        assert parse_date(raw, "dd/mm/yyyy") is None

    def test_the_declared_format_is_not_silently_swapped(self) -> None:
        assert parse_date("01/12/2026", "dd/mm/yyyy") == date(2026, 12, 1)
        assert parse_date("01/12/2026", "mm/dd/yyyy") == date(2026, 1, 12)


class TestDetectDateFormat:
    @pytest.mark.parametrize(
        ("samples", "expected"),
        [
            (["12/01/2026", "13/01/2026"], "dd/mm/yyyy"),
            (["01/13/2026", "01/14/2026"], "mm/dd/yyyy"),
            (["2026-01-12", "2026-02-01"], "yyyy-mm-dd"),
            (["12-01-2026", "20-02-2026"], "dd-mm-yyyy"),
            (["01/02/2026", "03/04/2026"], "dd/mm/yyyy"),  # ambiguous: day first by default
            ([datetime(2026, 1, 12), datetime(2026, 1, 13)], "yyyy-mm-dd"),  # native dates
        ],
    )
    def test_picks_the_format_every_sample_fits(self, samples: list[object], expected: str) -> None:
        assert detect_date_format(samples) == expected

    def test_returns_none_when_no_format_fits(self) -> None:
        assert detect_date_format(["hola", "mundo"]) is None


class TestDetectDecimalSeparator:
    @pytest.mark.parametrize(
        ("samples", "expected"),
        [
            (["1.850,5", "320"], ","),
            (["1,850.5", "320"], "."),
            (["12,5", "7"], ","),
            (["12.5", "7"], "."),
            (["320", "15"], "."),
            ([10, 12.5], "."),
        ],
    )
    def test_infers_from_the_samples(self, samples: list[object], expected: str) -> None:
        assert detect_decimal_separator(samples) == expected
