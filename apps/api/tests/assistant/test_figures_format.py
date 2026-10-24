"""Figures by reference: ids, locale formatting and filter links (plan 7c)."""

from __future__ import annotations

from datetime import date

import pytest

from api.assistant.figures import FigureKind, Refs
from api.assistant.format import format_figure
from api.schemas import FilterLink
from api.schemas.enums import RiskLevel


def refs() -> Refs:
    return Refs(turn=7)


class TestRefs:
    def test_ids_are_unique_to_the_turn_so_replayed_ids_never_resolve(self) -> None:
        first = Refs(turn=3).figure(12, FigureKind.COUNT)
        second = Refs(turn=4).figure(99, FigureKind.COUNT)

        assert first.id == "f3_1"
        assert second.id == "f4_1"
        assert Refs(turn=4).resolve_figure(first.id) is None

    def test_ids_increase_within_a_turn_and_products_have_their_own_series(self) -> None:
        r = refs()

        assert [r.figure(1, FigureKind.COUNT).id, r.figure(2, FigureKind.COUNT).id] == [
            "f7_1",
            "f7_2",
        ]
        assert r.product("QF-1", "Ácido").id == "p7_1"

    def test_the_same_product_gets_the_same_reference(self) -> None:
        r = refs()

        assert r.product("QF-1", "A").id == r.product("QF-1", "A").id

    def test_resolution_is_exact(self) -> None:
        r = refs()
        figure = r.figure(5, FigureKind.COUNT)

        assert r.resolve_figure(figure.id) == figure
        assert r.resolve_figure("f7_2") is None
        assert r.resolve_figure("f7_1 ") is None
        assert r.resolve_product(figure.id) is None

    def test_tool_values_expose_the_id_value_and_unit_but_the_model_never_formats(self) -> None:
        r = refs()
        link = FilterLink(risk=RiskLevel.CRITICAL, count=12)

        value = r.figure(12, FigureKind.COUNT, filter=link, label="critical products").for_model()

        assert value == {
            "id": "f7_1",
            "label": "critical products",
            "value": 12,
            "unit": "count",
            "filter": {"q": None, "risk": "critical", "abc": None, "count": 12},
        }


class TestFormat:
    @pytest.mark.parametrize(
        ("value", "kind", "uom", "locale", "expected"),
        [
            (1355, FigureKind.COUNT, None, "es", "1.355"),
            (1355, FigureKind.COUNT, None, "en", "1,355"),
            (12, FigureKind.COUNT, None, "es", "12"),
            (0.9, FigureKind.WEEKS, None, "es", "0,9 sem"),
            (0.9, FigureKind.WEEKS, None, "en", "0.9 wk"),
            (12.0, FigureKind.WEEKS, None, "es", "12 sem"),
            (1250.0, FigureKind.QUANTITY, "kg", "es", "1.250 kg"),
            (1250.5, FigureKind.QUANTITY, "kg", "en", "1,250.5 kg"),
            (0.04, FigureKind.QUANTITY, "l", "es", "0 l"),
            (14, FigureKind.DAYS, None, "es", "14 días"),
            (14, FigureKind.DAYS, None, "en", "14 days"),
            (1, FigureKind.DAYS, None, "es", "1 día"),
            (22.0, FigureKind.PERCENT, None, "es", "22 %"),
            (22.0, FigureKind.PERCENT, None, "en", "22%"),
            (date(2026, 10, 26), FigureKind.DATE, None, "es", "26 oct"),
            (date(2026, 3, 1), FigureKind.DATE, None, "es", "1 mar"),
            (date(2026, 10, 26), FigureKind.DATE, None, "en", "Oct 26"),
        ],
    )
    def test_formats_follow_the_locale(
        self, value: float | date, kind: FigureKind, uom: str | None, locale: str, expected: str
    ) -> None:
        figure = refs().figure(value, kind, uom=uom)

        assert format_figure(figure, locale) == expected

    def test_rounding_is_half_up_not_bankers(self) -> None:
        r = refs()

        assert format_figure(r.figure(0.25, FigureKind.WEEKS), "en") == "0.3 wk"
        assert format_figure(r.figure(2.5, FigureKind.COUNT), "en") == "3"

    def test_negative_numbers_keep_their_sign(self) -> None:
        assert format_figure(refs().figure(-3, FigureKind.COUNT), "es") == "-3"

    def test_unknown_locales_fall_back_to_spanish(self) -> None:
        assert format_figure(refs().figure(1355, FigureKind.COUNT), "fr") == "1.355"
