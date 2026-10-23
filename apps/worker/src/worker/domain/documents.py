"""Documents the digest job produces and the API reads (JSON in `uploads.profile` and
`normalization_plans.plan`). Pure data: no I/O, no third-party imports.

The field names mirror the API contract (`FileProfile`, `NormalizationPlan`, the plan view parts),
so the API can validate them without translation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

SOURCE_KARDEX = "kardex"
SOURCE_TABULAR = "tabular"
PLAN_VERSION = 1


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


@dataclass(frozen=True)
class ColumnProfile:
    name: str
    inferred_type: str  # date | number | text | empty
    samples: tuple[str, ...] = ()


@dataclass(frozen=True)
class SheetProfile:
    name: str
    row_count: int
    columns: tuple[ColumnProfile, ...] = ()
    header_row: int = 1


@dataclass(frozen=True)
class FileProfile:
    source_kind: str
    sheets: tuple[SheetProfile, ...]
    date_from: date | None = None
    date_to: date | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_kind": self.source_kind,
            "sheets": [
                {
                    "name": s.name,
                    "row_count": s.row_count,
                    "columns": [
                        {
                            "name": c.name,
                            "inferred_type": c.inferred_type,
                            "samples": list(c.samples),
                        }
                        for c in s.columns
                    ],
                }
                for s in self.sheets
            ],
            "date_from": _iso(self.date_from),
            "date_to": _iso(self.date_to),
        }


@dataclass(frozen=True)
class DateMapping:
    column: str
    format: str


@dataclass(frozen=True)
class ColumnRef:
    column: str


@dataclass(frozen=True)
class QuantityMapping:
    column: str
    decimal_separator: str = "."


@dataclass(frozen=True)
class UnitMapping:
    column: str | None = None
    default: str = "u"


@dataclass(frozen=True)
class NormalizationPlan:
    """Plan v1 (plan 6c). `date` is None when the file has no usable date column."""

    sheet: str
    header_row: int
    date: DateMapping | None
    product_code: ColumnRef
    product_name: ColumnRef | None
    quantity: QuantityMapping
    stock: QuantityMapping | None = None
    unit: UnitMapping = field(default_factory=UnitMapping)
    version: int = PLAN_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "sheet": self.sheet,
            "header_row": self.header_row,
            "date": {"column": self.date.column, "format": self.date.format} if self.date else None,
            "product_code": {"column": self.product_code.column},
            "product_name": {"column": self.product_name.column} if self.product_name else None,
            "quantity": {
                "column": self.quantity.column,
                "decimal_separator": self.quantity.decimal_separator,
            },
            "stock": (
                {"column": self.stock.column, "decimal_separator": self.stock.decimal_separator}
                if self.stock
                else None
            ),
            "unit": {"column": self.unit.column, "default": self.unit.default},
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> NormalizationPlan:
        date_part, name, stock, unit = (
            data.get("date"),
            data.get("product_name"),
            data.get("stock"),
            data.get("unit") or {},
        )
        return cls(
            sheet=data["sheet"],
            header_row=data["header_row"],
            date=DateMapping(date_part["column"], date_part["format"]) if date_part else None,
            product_code=ColumnRef(data["product_code"]["column"]),
            product_name=ColumnRef(name["column"]) if name else None,
            quantity=QuantityMapping(
                data["quantity"]["column"], data["quantity"].get("decimal_separator", ".")
            ),
            stock=QuantityMapping(stock["column"], stock.get("decimal_separator", "."))
            if stock
            else None,
            unit=UnitMapping(unit.get("column"), unit.get("default", "u")),
            version=data.get("version", PLAN_VERSION),
        )


@dataclass(frozen=True)
class DataSummary:
    products_found: int
    date_from: date | None
    date_to: date | None
    history_weeks: int
    rows_read: int
    rows_dropped: int


@dataclass(frozen=True)
class DataWarning:
    code: str  # short_history | dropped_rows | missing_stock | mixed_units | stale_data
    severity: str = "warning"
    count: int | None = None


@dataclass(frozen=True)
class MovementRule:
    code: str
    label: str
    treatment: str  # demand | return | excluded


@dataclass(frozen=True)
class DateColumnCandidate:
    column: str
    samples: tuple[str, ...] = ()


@dataclass(frozen=True)
class PlanDocument:
    """What the confirmation screen needs besides the file profile."""

    source_kind: str
    plan: NormalizationPlan | None = None
    summary: DataSummary | None = None
    movement_rules: tuple[MovementRule, ...] = ()
    warnings: tuple[DataWarning, ...] = ()
    date_column_candidates: tuple[DateColumnCandidate, ...] = ()
    unmapped_required: tuple[str, ...] = ()
    """Required fields the matcher could not map (`product_code`, `quantity`)."""
    needs_date_column: bool = False
    version: int = PLAN_VERSION

    def to_dict(self) -> dict[str, Any]:
        summary = self.summary
        return {
            "version": self.version,
            "source_kind": self.source_kind,
            "plan": self.plan.to_dict() if self.plan else None,
            "summary": (
                {
                    "products_found": summary.products_found,
                    "date_from": _iso(summary.date_from),
                    "date_to": _iso(summary.date_to),
                    "history_weeks": summary.history_weeks,
                    "rows_read": summary.rows_read,
                    "rows_dropped": summary.rows_dropped,
                }
                if summary
                else None
            ),
            "movement_rules": [
                {"code": r.code, "label": r.label, "treatment": r.treatment}
                for r in self.movement_rules
            ],
            "warnings": [
                {"code": w.code, "severity": w.severity, "count": w.count, "params": {}}
                for w in self.warnings
            ],
            "date_column_candidates": [
                {"column": c.column, "samples": list(c.samples)}
                for c in self.date_column_candidates
            ],
            "unmapped_required": list(self.unmapped_required),
            "needs_date_column": self.needs_date_column,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PlanDocument:
        summary = data.get("summary")
        return cls(
            source_kind=data["source_kind"],
            plan=NormalizationPlan.from_dict(data["plan"]) if data.get("plan") else None,
            summary=(
                DataSummary(
                    summary["products_found"],
                    _date(summary["date_from"]),
                    _date(summary["date_to"]),
                    summary["history_weeks"],
                    summary["rows_read"],
                    summary["rows_dropped"],
                )
                if summary
                else None
            ),
            movement_rules=tuple(MovementRule(**r) for r in data.get("movement_rules", [])),
            warnings=tuple(
                DataWarning(w["code"], w.get("severity", "warning"), w.get("count"))
                for w in data.get("warnings", [])
            ),
            date_column_candidates=tuple(
                DateColumnCandidate(c["column"], tuple(c.get("samples", [])))
                for c in data.get("date_column_candidates", [])
            ),
            unmapped_required=tuple(data.get("unmapped_required", [])),
            needs_date_column=data.get("needs_date_column", False),
            version=data.get("version", PLAN_VERSION),
        )
