"""ABC classification by volume share, computed within each unit of measure.

Units cannot be added together (kg, L, units), so each unit of measure is ranked on its own.
A product is A while the cumulative share before it is under 80 %, B under 95 %, otherwise C;
the product that crosses a line takes the higher class, so the largest product is always A.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from inventory.errors import InvalidInputError

A_SHARE = 0.80
B_SHARE = 0.95


class AbcClass(StrEnum):
    A = "A"
    B = "B"
    C = "C"


@dataclass(frozen=True, slots=True)
class AbcItem:
    code: str
    uom: str
    volume: float


def classify_abc(items: Iterable[AbcItem]) -> dict[str, AbcClass]:
    """Map each product code to its class. Ties are ordered by code for a stable result."""
    by_uom: dict[str, list[AbcItem]] = defaultdict(list)
    seen: set[str] = set()
    for item in items:
        if item.volume < 0:
            raise InvalidInputError(f"volume cannot be negative: {item.code}")
        if item.code in seen:
            raise InvalidInputError(f"duplicate product code: {item.code}")
        seen.add(item.code)
        by_uom[item.uom].append(item)

    result: dict[str, AbcClass] = {}
    for group in by_uom.values():
        total = sum(item.volume for item in group)
        cumulative = 0.0
        for item in sorted(group, key=lambda i: (-i.volume, i.code)):
            share_before = cumulative / total if total > 0 else 1.0
            if share_before < A_SHARE:
                result[item.code] = AbcClass.A
            elif share_before < B_SHARE:
                result[item.code] = AbcClass.B
            else:
                result[item.code] = AbcClass.C
            cumulative += item.volume
    return result
