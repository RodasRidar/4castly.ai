"""Value parsing for the plan executor (plan 6c).

Dates parse with the declared format and quantities with the declared decimal separator.
A value that does not parse is dropped and counted, never guessed.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

# Order is the tie-break for ambiguous samples: day first (the first client is Peruvian).
DATE_FORMATS: dict[str, str] = {
    "dd/mm/yyyy": "%d/%m/%Y",
    "mm/dd/yyyy": "%m/%d/%Y",
    "yyyy-mm-dd": "%Y-%m-%d",
    "dd-mm-yyyy": "%d-%m-%Y",
    "dd/mm/yy": "%d/%m/%y",
}
_NUMBER = re.compile(r"^-?\d+(\.\d+)?$")
_COMMA_DECIMAL = re.compile(r"^-?\d+,\d{1,2}$")
_COMMA_THOUSANDS = re.compile(r"^-?\d{1,3}(,\d{3})+$")
_DOT_DECIMAL = re.compile(r"^-?\d+\.\d{1,2}$")
_DOT_THOUSANDS = re.compile(r"^-?\d{1,3}(\.\d{3})+$")


def parse_decimal(value: Any, separator: str) -> float | None:
    """Parse a quantity. `separator` is the decimal mark; the other one is a thousands mark."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(".", "").replace(",", ".") if separator == "," else text.replace(",", "")
    return float(text) if _NUMBER.match(text) else None


def parse_date(value: Any, fmt: str) -> date | None:
    """Parse with exactly `fmt`. Native dates pass through; anything that does not fit is None."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), DATE_FORMATS[fmt]).date()  # noqa: DTZ007
    except ValueError:
        return None


def detect_date_format(samples: Sequence[Any], min_share: float = 1.0) -> str | None:
    """The first known format that at least `min_share` of the non-empty string samples fit.

    Ambiguous samples resolve day first. The default requires every sample to fit.
    """
    present = [s for s in samples if s not in (None, "")]
    if not present:
        return None
    strings = [s for s in present if isinstance(s, str)]
    if not strings:
        return "yyyy-mm-dd" if all(isinstance(s, date) for s in present) else None
    for fmt in DATE_FORMATS:
        fits = sum(parse_date(s, fmt) is not None for s in strings)
        if fits / len(strings) >= min_share:
            return fmt
    return None


def detect_decimal_separator(samples: Sequence[Any]) -> str:
    """Vote per sample; plain integers and native numbers carry no information (default `.`)."""
    votes: Counter[str] = Counter()
    for sample in samples:
        if not isinstance(sample, str):
            continue
        text = sample.strip()
        if "," in text and "." in text:
            votes[text[max(text.rfind(","), text.rfind("."))]] += 1
        elif _COMMA_DECIMAL.match(text) or _DOT_THOUSANDS.match(text):
            votes[","] += 1
        elif _DOT_DECIMAL.match(text) or _COMMA_THOUSANDS.match(text):
            votes["."] += 1
    return votes.most_common(1)[0][0] if votes else "."
