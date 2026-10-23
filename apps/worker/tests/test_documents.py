"""The documents round-trip through JSON exactly, so the API can read what the worker wrote."""

import json
from datetime import date

from worker.domain.documents import (
    ColumnProfile,
    ColumnRef,
    DataSummary,
    DataWarning,
    DateColumnCandidate,
    DateMapping,
    FileProfile,
    MovementRule,
    NormalizationPlan,
    PlanDocument,
    QuantityMapping,
    SheetProfile,
    UnitMapping,
)

PLAN = NormalizationPlan(
    sheet="Ventas",
    header_row=1,
    date=DateMapping("Fecha Doc", "dd/mm/yyyy"),
    product_code=ColumnRef("Cod Art"),
    product_name=ColumnRef("Artículo"),
    quantity=QuantityMapping("Cant", ","),
    stock=None,
    unit=UnitMapping(None, "u"),
)


def test_plan_round_trips_and_matches_the_6c_example() -> None:
    assert NormalizationPlan.from_dict(json.loads(json.dumps(PLAN.to_dict()))) == PLAN
    assert PLAN.to_dict() == {
        "version": 1,
        "sheet": "Ventas",
        "header_row": 1,
        "date": {"column": "Fecha Doc", "format": "dd/mm/yyyy"},
        "product_code": {"column": "Cod Art"},
        "product_name": {"column": "Artículo"},
        "quantity": {"column": "Cant", "decimal_separator": ","},
        "stock": None,
        "unit": {"column": None, "default": "u"},
    }


def test_plan_without_a_date_column_round_trips() -> None:
    plan = NormalizationPlan(
        "S",
        2,
        None,
        ColumnRef("c"),
        None,
        QuantityMapping("q"),
        QuantityMapping("s", ","),
        UnitMapping("u", "kg"),
    )

    assert NormalizationPlan.from_dict(plan.to_dict()) == plan


def test_plan_document_round_trips_every_part() -> None:
    document = PlanDocument(
        source_kind="tabular",
        plan=PLAN,
        summary=DataSummary(26, date(2026, 1, 12), date(2026, 10, 18), 40, 4812, 3),
        movement_rules=(MovementRule("01", "Venta", "demand"),),
        warnings=(
            DataWarning("short_history", "warning", 3),
            DataWarning("missing_stock", "info", None),
        ),
        date_column_candidates=(DateColumnCandidate("Periodo", ("2026-01",)),),
        unmapped_required=("quantity",),
        needs_date_column=True,
    )

    assert PlanDocument.from_dict(json.loads(json.dumps(document.to_dict()))) == document


def test_file_profile_serialises_dates_and_samples_as_the_contract_expects() -> None:
    profile = FileProfile(
        "tabular",
        (SheetProfile("Ventas", 10, (ColumnProfile("Fecha Doc", "date", ("12/01/2026",)),)),),
        date(2026, 1, 12),
        date(2026, 10, 18),
    )

    assert profile.to_dict() == {
        "source_kind": "tabular",
        "sheets": [
            {
                "name": "Ventas",
                "row_count": 10,
                "columns": [
                    {"name": "Fecha Doc", "inferred_type": "date", "samples": ["12/01/2026"]}
                ],
            }
        ],
        "date_from": "2026-01-12",
        "date_to": "2026-10-18",
    }
