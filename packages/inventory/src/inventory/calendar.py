"""Calendar helpers: week numbering and data staleness."""

from __future__ import annotations

from datetime import date, timedelta

STALE_AFTER_DAYS = 7


def is_stale(data_until: date, today: date) -> bool:
    """True when the data ends more than a week before `today`."""
    return (today - data_until).days > STALE_AFTER_DAYS


def week_start(data_until: date, week: int) -> date:
    """Monday of forecast week `week` (1-based): week 1 is the ISO week after `data_until`."""
    monday_after = data_until + timedelta(days=7 - data_until.weekday())
    return monday_after + timedelta(weeks=week - 1)
