"""The synthetic tenant behind the mocks is deterministic and coherent with the formulas."""

import json
from datetime import date
from pathlib import Path

import pytest

from inventory import (
    Demand,
    Method,
    ProductInputs,
    RiskLevel,
    analyze_product,
    select_method,
)
from inventory.fixtures import DATA_FILE, build_dataset, main


@pytest.fixture(scope="module")
def dataset() -> dict:
    return build_dataset()


def test_dataset_is_deterministic() -> None:
    assert build_dataset() == build_dataset()
    assert build_dataset(seed=1) != build_dataset(seed=2)


def test_dataset_header(dataset: dict) -> None:
    assert dataset["data_until"] == date(2026, 10, 18).isoformat()
    assert dataset["horizon_weeks"] == 12
    assert [h["enabled"] for h in dataset["horizons"]] == [True, True, False]
    assert len(dataset["products"]) >= 20


def test_every_unit_of_measure_and_abc_class_is_represented(dataset: dict) -> None:
    products = dataset["products"]

    assert {p["uom"] for p in products} == {"kg", "L", "u"}
    assert {p["abc_class"] for p in products} == {"A", "B", "C"}


def test_all_three_risk_levels_appear_with_and_without_stockout(dataset: dict) -> None:
    analyses = [p["analysis"] for p in dataset["products"]]

    assert {a["risk"] for a in analyses} == {level.value for level in RiskLevel}
    assert any(a["coverage"]["expected"] is None for a in analyses)
    assert any(a["buy_before"]["action"] == "order_today" for a in analyses)


def test_short_history_products_use_the_simple_method_with_low_reliability(
    dataset: dict,
) -> None:
    simple = [p for p in dataset["products"] if p["method"] == Method.SIMPLE]

    assert simple
    assert {p["reliability"] for p in simple} == {"low"}
    assert all(p["non_censored_weeks"] < 8 for p in simple)


def test_stored_analysis_matches_the_formulas_for_every_product(dataset: dict) -> None:
    for product in dataset["products"]:
        demand = product["forecast"]
        inputs = ProductInputs(
            stock=product["stock"],
            demand=Demand(
                low=tuple(demand["low"]),
                expected=tuple(demand["expected"]),
                high=tuple(demand["high"]),
            ),
            lead_time_days=product["lead_time_days"],
            target_coverage_weeks=product["target_coverage_weeks"],
            arrivals=dict(product["on_order"]),
        )

        analysis = analyze_product(inputs)

        stored = product["analysis"]
        assert stored["risk"] == analysis.risk
        assert stored["expected"]["stock"] == pytest.approx(list(analysis.expected.stock), abs=1e-3)
        assert stored["suggested"]["low"] == pytest.approx(analysis.suggested.low, abs=1e-3)
        assert select_method(product["non_censored_weeks"]) == product["method"]


def test_with_purchase_view_is_consistent_with_the_suggested_quantity(dataset: dict) -> None:
    for product in dataset["products"]:
        view = product["analysis_with_purchase"]
        quantity = product["analysis"]["suggested"]["low"]
        assert view["purchase_quantity"] == quantity
        if quantity > 0:
            assert view["expected"]["stock"] != product["analysis"]["expected"]["stock"]


def test_main_writes_the_dataset_idempotently(tmp_path: Path) -> None:
    assert main(["--out", str(tmp_path)]) == 0
    first = (tmp_path / DATA_FILE).read_text()
    assert main(["--out", str(tmp_path)]) == 0

    assert (tmp_path / DATA_FILE).read_text() == first
    assert json.loads(first) == build_dataset()
    assert len(first) < 400_000  # stays under the repo's large-file hook


def _numbers(value: object) -> list[float]:
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return []
    if isinstance(value, int | float):
        return [float(value)]
    if isinstance(value, dict):
        return [n for v in value.values() for n in _numbers(v)]
    if isinstance(value, list):
        return [n for v in value for n in _numbers(v)]
    return []


def test_figures_carry_no_floating_point_noise(dataset: dict) -> None:
    for product in dataset["products"]:
        for number in _numbers(product["analysis"]) + _numbers(product["analysis_with_purchase"]):
            assert number == round(number, 3), (product["code"], number)


def test_risk_mix_is_believable_for_a_demo(dataset: dict) -> None:
    risks = [p["analysis"]["risk"] for p in dataset["products"]]

    assert risks.count("critical") / len(risks) <= 0.4
    assert risks.count("optimal") >= 8


COMMITTED = Path(__file__).resolve().parents[3] / "apps/web/src/services/mock/fixtures" / DATA_FILE


@pytest.mark.skipif(not COMMITTED.exists(), reason="web fixtures not present")
def test_committed_fixtures_match_the_generator() -> None:
    """Fails when formulas or the generator change without regenerating the mocks."""
    assert json.loads(COMMITTED.read_text(encoding="utf-8")) == build_dataset()
