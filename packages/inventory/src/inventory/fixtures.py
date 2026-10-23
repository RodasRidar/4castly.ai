"""Synthetic tenant for the frontend mocks, generated through the formulas.

One coherent example tenant (an importer of chemical and pharma inputs): demand history,
forecast scenarios, stock and lead times go through `analyze_product`, so every figure the mocks
show is consistent by construction. Output is deterministic for a given seed.

    python -m inventory.fixtures --out apps/web/src/services/mock/fixtures
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections.abc import Sequence
from dataclasses import asdict, dataclass, is_dataclass
from datetime import date, timedelta
from enum import Enum
from pathlib import Path
from typing import Any

from inventory.abc import AbcItem, classify_abc
from inventory.analysis import analyze_product, with_purchase
from inventory.calendar import week_start
from inventory.history import Method, available_horizons, select_method, simple_demand
from inventory.models import Demand, ProductInputs

DATA_FILE = "dataset.json"
DEFAULT_SEED = 42
DATA_UNTIL = date(2026, 10, 18)  # a Sunday: forecast week 1 starts Monday 2026-10-19
HORIZON_WEEKS = 12
HISTORY_WEEKS = 40
TARGET_COVERAGE_WEEKS = 4
P10_P90_Z = 1.2816  # normal quantile for the 10 / 90 % band
CENSOR_PROBABILITY = 0.05
CENSORED_DEMAND_FACTOR = 0.6
RELIABILITY_HIGH_CV = 0.2
RELIABILITY_MEDIUM_CV = 0.3
SEASONAL_PERIOD_WEEKS = 52
FIGURE_DECIMALS = 3


@dataclass(frozen=True, slots=True)
class _Spec:
    """One synthetic product. `cover_weeks` sizes the starting stock against typical demand."""

    code: str
    name: str
    uom: str
    level: float
    cv: float
    amplitude: float
    cover_weeks: float
    lead_time_days: int
    history_weeks: int = HISTORY_WEEKS
    on_order: tuple[tuple[int, float], ...] = ()  # (week, multiple of weekly level)


_SPECS: tuple[_Spec, ...] = (
    _Spec("QF-0001", "Ácido cítrico anhidro", "kg", 1850, 0.18, 0.15, 1.0, 21),
    _Spec("QF-0002", "Glicerina vegetal USP", "kg", 1200, 0.15, 0.10, 9.0, 30),
    _Spec("QF-0003", "Lactosa monohidrato", "kg", 900, 0.20, 0.20, 6.0, 30),
    _Spec("QF-0004", "Paracetamol polvo", "kg", 640, 0.25, 0.10, 2.0, 45, on_order=((6, 2.0),)),
    _Spec("QF-0005", "Almidón de maíz", "kg", 520, 0.12, 0.05, 8.0, 14),
    _Spec("QF-0006", "Sorbitol 70 %", "kg", 310, 0.30, 0.20, 4.0, 21),
    _Spec("QF-0007", "Estearato de magnesio", "kg", 95, 0.35, 0.10, 40.0, 14),
    _Spec("QF-0008", "Dióxido de titanio", "kg", 140, 0.22, 0.10, 6.0, 45),
    _Spec("QF-0009", "Etanol 96°", "L", 2400, 0.16, 0.12, 2.5, 14),
    _Spec("QF-0010", "Propilenglicol", "L", 760, 0.20, 0.10, 7.0, 21),
    _Spec("QF-0011", "Acetona grado reactivo", "L", 430, 0.28, 0.15, 0.6, 14, on_order=((3, 3.0),)),
    _Spec("QF-0012", "Isopropanol 99 %", "L", 380, 0.25, 0.20, 8.0, 30),
    _Spec("QF-0013", "Metanol", "L", 120, 0.30, 0.10, 3.0, 14),
    _Spec("QF-0014", "Aceite de silicona", "L", 45, 0.40, 0.10, 6.0, 30),
    _Spec("QF-0015", "Frasco PET 120 ml", "u", 5200, 0.20, 0.10, 9.0, 30),
    _Spec("QF-0016", "Tapa rosca 28 mm", "u", 4800, 0.20, 0.10, 1.5, 21, on_order=((4, 2.0),)),
    _Spec("QF-0017", "Etiqueta adhesiva 80 x 50", "u", 3600, 0.30, 0.25, 10.0, 14),
    _Spec("QF-0018", "Caja corrugada x 12", "u", 880, 0.22, 0.10, 3.5, 14),
    _Spec("QF-0019", "Blíster PVC", "u", 250, 0.35, 0.10, 2.0, 21),
    _Spec("QF-0020", "Filtro de membrana 0,22 µm", "u", 14, 0.50, 0.0, 4.0, 45),
    _Spec("QF-0021", "Colorante azul alimentario", "kg", 18, 0.40, 0.0, 5.0, 30, history_weeks=6),
    _Spec("QF-0022", "Aroma de cereza", "L", 22, 0.45, 0.0, 12.0, 14, history_weeks=5),
    _Spec("QF-0023", "Tapa dosificadora", "u", 300, 0.40, 0.0, 3.0, 21, history_weeks=7),
    _Spec("QF-0024", "Reactivo Karl Fischer", "L", 6, 0.50, 0.0, 8.0, 45),
    _Spec("QF-0025", "Papel filtro cualitativo", "u", 40, 0.30, 0.0, 20.0, 14),
    _Spec("QF-0026", "Carbómero 940", "kg", 28, 0.35, 0.10, 9.0, 30),
)


def build_dataset(seed: int = DEFAULT_SEED) -> dict[str, Any]:
    """Build the whole tenant as JSON-native structures (dicts, lists, strings, numbers)."""
    rng = random.Random(seed)  # noqa: S311 - deterministic fixtures, not security
    last_history_monday = DATA_UNTIL - timedelta(days=DATA_UNTIL.weekday())
    products = [
        _build_product(spec, index, rng, last_history_monday) for index, spec in enumerate(_SPECS)
    ]

    classes = classify_abc(
        AbcItem(code=p["code"], uom=p["uom"], volume=sum(p["history"]["qty"])) for p in products
    )
    for product in products:
        product["abc_class"] = classes[product["code"]].value

    return {
        "tenant": {"name": "Droguería Demo S.A.C."},
        "seed": seed,
        "data_until": DATA_UNTIL.isoformat(),
        "horizon_weeks": HORIZON_WEEKS,
        "history_weeks": HISTORY_WEEKS,
        "horizons": [asdict(h) for h in available_horizons(HISTORY_WEEKS)],
        "forecast_weeks": [
            {"week": week, "start": week_start(DATA_UNTIL, week).isoformat()}
            for week in range(1, HORIZON_WEEKS + 1)
        ],
        "products": products,
    }


def _seasonal(spec: _Spec, index: int, week: int) -> float:
    phase = 2 * math.pi * (week + index * 3) / SEASONAL_PERIOD_WEEKS
    return spec.level * (1 + spec.amplitude * math.sin(phase))


def _build_product(
    spec: _Spec, index: int, rng: random.Random, last_history_monday: date
) -> dict[str, Any]:
    history, censored = _history(spec, index, rng)
    non_censored = [q for i, q in enumerate(history) if i not in censored]
    method = select_method(len(non_censored))
    demand = _forecast(spec, index, method, non_censored)
    stock = round(spec.cover_weeks * sum(demand.expected[:4]) / 4, 1)
    inputs = ProductInputs(
        stock=stock,
        demand=demand,
        lead_time_days=spec.lead_time_days,
        target_coverage_weeks=TARGET_COVERAGE_WEEKS,
        arrivals={week: round(spec.level * factor, 1) for week, factor in spec.on_order},
    )
    analysis = analyze_product(inputs)
    purchase = analysis.suggested.low
    with_buy = analyze_product(with_purchase(inputs, purchase))

    return {
        "code": spec.code,
        "name": spec.name,
        "uom": spec.uom,
        "method": method.value,
        "reliability": _reliability(spec, method),
        "history": {
            "start": (last_history_monday - timedelta(weeks=len(history) - 1)).isoformat(),
            "qty": history,
            "censored": sorted(censored),
        },
        "non_censored_weeks": len(non_censored),
        "stock": stock,
        "lead_time_days": spec.lead_time_days,
        "target_coverage_weeks": TARGET_COVERAGE_WEEKS,
        "on_order": [[week, qty] for week, qty in inputs.arrivals.items()],
        "forecast": {
            "low": list(demand.low),
            "expected": list(demand.expected),
            "high": list(demand.high),
        },
        "analysis": _plain(analysis),
        "analysis_with_purchase": {**_plain(with_buy), "purchase_quantity": _plain(purchase)},
    }


def _history(spec: _Spec, index: int, rng: random.Random) -> tuple[list[float], set[int]]:
    """Weekly history ending at `data_until`. Short-history products are never censored."""
    weeks = spec.history_weeks
    offset = HISTORY_WEEKS - weeks
    quantities: list[float] = []
    censored: set[int] = set()
    for i in range(weeks):
        value = max(0.0, _seasonal(spec, index, offset + i - HISTORY_WEEKS) * rng.gauss(1, spec.cv))
        if weeks >= HISTORY_WEEKS and i < weeks - 1 and rng.random() < CENSOR_PROBABILITY:
            censored.add(i)
            value *= CENSORED_DEMAND_FACTOR
        quantities.append(round(value, 1))
    return quantities, censored


def _forecast(spec: _Spec, index: int, method: Method, observed: Sequence[float]) -> Demand:
    if method is Method.SIMPLE:
        raw = simple_demand(observed, HORIZON_WEEKS)
        return Demand(
            low=tuple(round(x, 1) for x in raw.low),
            expected=tuple(round(x, 1) for x in raw.expected),
            high=tuple(round(x, 1) for x in raw.high),
        )
    low: list[float] = []
    expected: list[float] = []
    high: list[float] = []
    for week in range(1, HORIZON_WEEKS + 1):
        mid = _seasonal(spec, index, week)
        band = P10_P90_Z * spec.level * spec.cv * (1 + 0.04 * (week - 1))
        low.append(round(max(0.0, mid - band), 1))
        expected.append(round(mid, 1))
        high.append(round(mid + band, 1))
    return Demand(low=tuple(low), expected=tuple(expected), high=tuple(high))


def _reliability(spec: _Spec, method: Method) -> str:
    """Stand-in for the backtest-derived reliability (D13) in the synthetic tenant."""
    if method is Method.SIMPLE or spec.cv > RELIABILITY_MEDIUM_CV:
        return "low"
    return "high" if spec.cv <= RELIABILITY_HIGH_CV else "medium"


def _plain(value: Any) -> Any:
    """Convert dataclasses, enums and tuples into JSON-native values."""
    if is_dataclass(value) and not isinstance(value, type):
        return {k: _plain(v) for k, v in asdict(value).items()}
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, float):
        return round(value, FIGURE_DECIMALS)
    return value


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the synthetic tenant fixtures.")
    parser.add_argument("--out", type=Path, required=True, help="directory to write into")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / DATA_FILE
    target.write_text(
        json.dumps(build_dataset(args.seed), indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    sys.stdout.write(f"wrote {target}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
