"""Normalization plan: what the confirmation screen (04) shows and what the user confirms.

`NormalizationPlan` is the machine plan (also the LLM structured-output schema, plan 6c). `PlanView`
wraps it with everything the screen needs: samples, warnings, movement rules and date candidates.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import Field

from api.schemas.base import ApiModel, RequestModel
from api.schemas.enums import (
    MappedField,
    MovementTreatment,
    PlanAuthor,
    PlanStatus,
    SourceKind,
    WarningCode,
    WarningSeverity,
)


class DateMapping(RequestModel):
    column: str = Field(min_length=1, max_length=255)
    format: str = Field(min_length=1, max_length=32)
    """For example `dd/mm/yyyy`."""


class TextMapping(RequestModel):
    column: str = Field(min_length=1, max_length=255)


class QuantityMapping(RequestModel):
    column: str = Field(min_length=1, max_length=255)
    decimal_separator: Literal[".", ","] = "."


class UnitMapping(RequestModel):
    column: str | None = Field(default=None, max_length=255)
    default: str = Field(default="u", min_length=1, max_length=16)
    """Unit of measure used when the file has no unit column."""


class NormalizationPlan(RequestModel):
    version: Literal[1] = 1
    sheet: str = Field(min_length=1, max_length=255)
    header_row: int = Field(ge=1)
    date: DateMapping | None
    """`null` means the file has no date column (screen 08b, "Mi archivo no tiene fechas")."""
    product_code: TextMapping
    product_name: TextMapping | None
    quantity: QuantityMapping
    stock: QuantityMapping | None
    unit: UnitMapping


class ColumnMapping(ApiModel):
    """One row of the mapping card."""

    field: MappedField
    column: str | None
    """`null` when the file has no such column ("— No tengo esta columna —")."""
    required: bool
    samples: list[str] = Field(max_length=5)
    detail: str | None
    """Date format or decimal separator detected, when relevant."""


class DataWarning(ApiModel):
    code: WarningCode
    severity: WarningSeverity
    count: int | None
    """For example how many products have short history."""
    params: dict[str, str | int | float] = Field(default_factory=dict)


class MovementRule(ApiModel):
    """Kardex only: which movement codes count as demand (01 sales minus 05 returns)."""

    code: str
    label: str
    treatment: MovementTreatment


class DateColumnCandidate(ApiModel):
    column: str
    samples: list[str] = Field(max_length=5)


class DataSummary(ApiModel):
    products_found: int = Field(ge=0)
    date_from: date | None
    date_to: date | None
    history_weeks: int = Field(ge=0)
    rows_read: int = Field(ge=0)
    rows_dropped: int = Field(ge=0)


class PlanView(ApiModel):
    source_kind: SourceKind
    status: PlanStatus
    proposed_by: PlanAuthor
    sheets: list[str]
    selected_sheet: str | None
    plan: NormalizationPlan | None
    """`null` while the file has no usable plan (unreadable or needs a date column)."""
    mappings: list[ColumnMapping]
    summary: DataSummary | None
    movement_rules: list[MovementRule]
    warnings: list[DataWarning]
    date_column_candidates: list[DateColumnCandidate]
    """Plausible date columns, for screen 08b."""


class PlanConfirmation(RequestModel):
    """PUT body. `plan: null` confirms the proposed plan as is; a plan replaces it (Corregir)."""

    plan: NormalizationPlan | None = None
