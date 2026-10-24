"""Figures and products the model may mention, by reference.

Tools return values with ids; the model writes `[[f7_3]]` instead of a number and the stream layer
swaps in the exact value. Ids carry the turn number, so an id copied from an earlier turn of the
replayed history never resolves to a different figure in the current one.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from typing import Any

from api.schemas import FilterLink


class FigureKind(StrEnum):
    COUNT = "count"
    WEEKS = "weeks"
    QUANTITY = "quantity"
    DAYS = "days"
    PERCENT = "percent"
    DATE = "date"


@dataclass(frozen=True)
class Figure:
    id: str
    value: float | int | date
    kind: FigureKind
    uom: str | None = None
    filter: FilterLink | None = None
    label: str = ""

    def for_model(self) -> dict[str, Any]:
        """What the model reads: it may reason with the value, but must write the id."""
        data: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "value": self.value.isoformat() if isinstance(self.value, date) else self.value,
            "unit": self.kind.value,
        }
        if self.uom is not None:
            data["uom"] = self.uom
        if self.filter is not None:
            data["filter"] = self.filter.model_dump(mode="json")
        return data


@dataclass(frozen=True)
class ProductRef:
    id: str
    code: str
    name: str

    def for_model(self) -> dict[str, str]:
        return {"id": self.id, "code": self.code, "name": self.name}


class Refs:
    """Everything the tools of one turn handed out."""

    def __init__(self, turn: int) -> None:
        self.turn = turn
        self._figures: dict[str, Figure] = {}
        self._products: dict[str, ProductRef] = {}
        self._by_code: dict[str, ProductRef] = {}

    def figure(
        self,
        value: float | int | date,
        kind: FigureKind,
        *,
        uom: str | None = None,
        filter: FilterLink | None = None,  # noqa: A002 - mirrors the contract's field name
        label: str = "",
    ) -> Figure:
        figure = Figure(f"f{self.turn}_{len(self._figures) + 1}", value, kind, uom, filter, label)
        self._figures[figure.id] = figure
        return figure

    def product(self, code: str, name: str) -> ProductRef:
        if code in self._by_code:
            return self._by_code[code]
        ref = ProductRef(f"p{self.turn}_{len(self._products) + 1}", code, name)
        self._products[ref.id] = ref
        self._by_code[code] = ref
        return ref

    def resolve_figure(self, ref_id: str) -> Figure | None:
        return self._figures.get(ref_id)

    def resolve_product(self, ref_id: str) -> ProductRef | None:
        return self._products.get(ref_id)
