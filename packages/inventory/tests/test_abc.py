"""ABC classification by volume share within each unit of measure (D12, Q5)."""

import pytest

from inventory import AbcClass, AbcItem, InvalidInputError, classify_abc


def items(uom: str, volumes: list[float]) -> list[AbcItem]:
    return [AbcItem(code=f"{uom}{i}", uom=uom, volume=v) for i, v in enumerate(volumes)]


def test_pareto_split_80_15_5() -> None:
    result = classify_abc(items("kg", [80, 10, 5, 3, 2]))

    assert [result[f"kg{i}"] for i in range(5)] == [
        AbcClass.A,
        AbcClass.B,
        AbcClass.B,
        AbcClass.C,
        AbcClass.C,
    ]


def test_input_order_does_not_matter() -> None:
    result = classify_abc(items("kg", [2, 3, 5, 10, 80]))

    assert result["kg4"] is AbcClass.A
    assert result["kg0"] is AbcClass.C


def test_a_single_dominant_product_is_class_a() -> None:
    assert classify_abc(items("kg", [100, 1])) == {"kg0": AbcClass.A, "kg1": AbcClass.C}


def test_units_of_measure_are_classified_independently() -> None:
    result = classify_abc(items("kg", [1000]) + items("L", [1]))

    assert result == {"kg0": AbcClass.A, "L0": AbcClass.A}


def test_zero_volume_everywhere_is_class_c() -> None:
    assert set(classify_abc(items("u", [0, 0])).values()) == {AbcClass.C}


def test_ties_are_broken_by_code_for_a_stable_result() -> None:
    shuffled = [AbcItem(code, "u", 40.0) for code in ("u3", "u0", "u4", "u1", "u2")]

    result = classify_abc(shuffled)

    assert result["u4"] is AbcClass.B  # last by code, crosses the 80 % line
    assert {result[c] for c in ("u0", "u1", "u2", "u3")} == {AbcClass.A}


def test_duplicate_codes_are_rejected() -> None:
    with pytest.raises(InvalidInputError):
        classify_abc([AbcItem("X", "kg", 1.0), AbcItem("X", "L", 2.0)])


def test_negative_volume_is_rejected() -> None:
    with pytest.raises(InvalidInputError):
        classify_abc([AbcItem("X", "kg", -1.0)])
