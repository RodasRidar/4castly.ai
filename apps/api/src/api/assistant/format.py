"""Exact, locale-aware text for a figure (es-PE: `1.355`, `0,9 sem`)."""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from api.assistant.figures import Figure, FigureKind

_SEPARATORS = {"es": (".", ","), "en": (",", ".")}
_MONTHS = {
    "es": ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"),
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
}
_DECIMALS = {
    FigureKind.COUNT: 0,
    FigureKind.WEEKS: 1,
    FigureKind.QUANTITY: 1,
    FigureKind.DAYS: 0,
    FigureKind.PERCENT: 1,
}


def _locale(locale: str) -> str:
    return locale if locale in _SEPARATORS else "es"


def _number(value: float | int, decimals: int, locale: str) -> str:
    group, point = _SEPARATORS[locale]
    quantum = Decimal(1).scaleb(-decimals)
    rounded = Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    whole, _, fraction = f"{abs(rounded):f}".partition(".")
    grouped = f"{int(whole):,}".replace(",", group)
    fraction = fraction.rstrip("0")
    sign = "-" if rounded < 0 else ""
    return f"{sign}{grouped}{point + fraction if fraction else ''}"


def _unit(kind: FigureKind, value: float | int, locale: str) -> str:
    one = value == 1
    return {
        FigureKind.WEEKS: {"es": " sem", "en": " wk"},
        FigureKind.DAYS: {
            "es": " día" if one else " días",
            "en": " day" if one else " days",
        },
        FigureKind.PERCENT: {"es": " %", "en": "%"},
    }.get(kind, {}).get(locale, "")


def format_figure(figure: Figure, locale: str) -> str:
    locale = _locale(locale)
    if figure.kind is FigureKind.DATE:
        day = figure.value
        if not isinstance(day, date):
            message = "a date figure needs a date"
            raise TypeError(message)
        month = _MONTHS[locale][day.month - 1]
        return f"{day.day} {month}" if locale == "es" else f"{month} {day.day}"
    value = figure.value
    if isinstance(value, date):
        message = "only date figures hold dates"
        raise TypeError(message)
    text = _number(value, _DECIMALS[figure.kind], locale)
    if figure.kind is FigureKind.QUANTITY:
        return f"{text} {figure.uom}" if figure.uom else text
    return f"{text}{_unit(figure.kind, value, locale)}"
