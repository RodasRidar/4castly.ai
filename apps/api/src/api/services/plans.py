"""The normalization plan: what the confirmation screen shows (GET) and confirms (PUT).

The digest job stores a `PlanDocument` (JSON, version 1) in `normalization_plans.plan` and the file
profile in `uploads.profile`. Here they become the `PlanView` of the contract. Nothing is cleaned
or forecast here: the worker executes the confirmed plan later.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import BusinessRuleError, ConflictError, NotFoundError
from api.schemas import (
    ColumnMapping,
    DataSummary,
    DataWarning,
    DateColumnCandidate,
    MovementRule,
    NormalizationPlan,
    PlanConfirmation,
    PlanView,
)
from api.schemas.enums import MappedField, PlanAuthor, PlanStatus, SourceKind
from api.services import audit

CONFIRMABLE_STAGES = {"awaiting_confirmation", "needs_date_column", "confirmed", "clarifying"}
"""Once a forecast job exists the plan is frozen: a new mapping would not match the run."""

_REQUIRED = {MappedField.DATE, MappedField.PRODUCT_CODE, MappedField.QUANTITY}
_FIELD_ORDER = (
    MappedField.DATE,
    MappedField.PRODUCT_CODE,
    MappedField.PRODUCT_NAME,
    MappedField.QUANTITY,
    MappedField.STOCK,
    MappedField.UNIT,
)

_LOAD = text(
    "select c.stage, u.id as upload_id, u.sheets, u.selected_sheet, u.profile, "
    "p.id as plan_id, p.plan, p.proposed_by, p.confirmed_at "
    "from public.conversations c "
    "join public.uploads u on u.conversation_id = c.id "
    "join public.normalization_plans p on p.upload_id = u.id "
    "where c.id = :id and c.deleted_at is null "
    "order by u.created_at desc, p.created_at desc limit 1"
)
_SAVE_PLAN = text(
    "update public.normalization_plans set plan = cast(:plan as jsonb), proposed_by = :by, "
    "confirmed_at = now(), confirmed_by = :user_id where id = :id"
)
_SAVE_SHEET = text("update public.uploads set selected_sheet = :sheet where id = :id")
_SAVE_STAGE = text(
    "update public.conversations set stage = 'confirmed', last_activity_at = now() where id = :id"
)


def _samples(profile: dict[str, Any] | None, sheet: str | None, column: str | None) -> list[str]:
    for candidate in (profile or {}).get("sheets", []):
        if candidate["name"] == sheet:
            for known in candidate.get("columns", []):
                if known["name"] == column:
                    return list(known.get("samples", []))[:5]
    return []


def _mappings(document: dict[str, Any], profile: dict[str, Any] | None) -> list[ColumnMapping]:
    if document["source_kind"] == SourceKind.KARDEX:
        return []
    plan = document.get("plan")
    if plan is None:
        missing = [MappedField(f) for f in document.get("unmapped_required", [])]
        if document.get("needs_date_column"):
            missing.insert(0, MappedField.DATE)
        return [
            ColumnMapping(field=f, column=None, required=True, samples=[], detail=None)
            for f in missing
        ]
    columns: dict[MappedField, tuple[str | None, str | None]] = {
        MappedField.DATE: (
            plan["date"]["column"] if plan["date"] else None,
            plan["date"]["format"] if plan["date"] else None,
        ),
        MappedField.PRODUCT_CODE: (plan["product_code"]["column"], None),
        MappedField.PRODUCT_NAME: (
            plan["product_name"]["column"] if plan["product_name"] else None,
            None,
        ),
        MappedField.QUANTITY: (
            plan["quantity"]["column"],
            "decimal ," if plan["quantity"]["decimal_separator"] == "," else None,
        ),
        MappedField.STOCK: (
            plan["stock"]["column"] if plan["stock"] else None,
            "decimal ," if plan["stock"] and plan["stock"]["decimal_separator"] == "," else None,
        ),
        MappedField.UNIT: (plan["unit"]["column"], None),
    }
    return [
        ColumnMapping(
            field=field,
            column=columns[field][0],
            required=field in _REQUIRED,
            samples=_samples(profile, plan["sheet"], columns[field][0]),
            detail=columns[field][1],
        )
        for field in _FIELD_ORDER
    ]


def _view(row: Any) -> PlanView:
    document = row.plan
    plan = NormalizationPlan.model_validate(document["plan"]) if document.get("plan") else None
    summary = document.get("summary")
    return PlanView(
        source_kind=SourceKind(document["source_kind"]),
        status=PlanStatus.CONFIRMED if row.confirmed_at else PlanStatus.PROPOSED,
        proposed_by=PlanAuthor(row.proposed_by),
        sheets=list(row.sheets or []),
        selected_sheet=row.selected_sheet,
        plan=plan,
        mappings=_mappings(document, row.profile),
        summary=DataSummary.model_validate(summary) if summary else None,
        movement_rules=[MovementRule.model_validate(r) for r in document.get("movement_rules", [])],
        warnings=[DataWarning.model_validate(w) for w in document.get("warnings", [])],
        date_column_candidates=[
            DateColumnCandidate.model_validate(c)
            for c in document.get("date_column_candidates", [])
        ],
    )


async def _load(session: AsyncSession, conversation_id: UUID) -> Any:
    row = (await session.execute(_LOAD, {"id": conversation_id})).one_or_none()
    if row is None:
        raise NotFoundError
    return row


async def get_plan(session: AsyncSession, who: Principal, conversation_id: UUID) -> PlanView:
    del who
    return _view(await _load(session, conversation_id))


def _check_against_file(plan: NormalizationPlan, profile: dict[str, Any] | None) -> None:
    """Every column the plan names must exist in the chosen sheet (the user may have mistyped)."""
    if plan.date is None:
        raise BusinessRuleError("errors.planIncomplete")
    sheet = next((s for s in (profile or {}).get("sheets", []) if s["name"] == plan.sheet), None)
    if sheet is None:
        raise BusinessRuleError("errors.planColumnUnknown")
    known = {c["name"] for c in sheet.get("columns", [])}
    named = [plan.date.column, plan.product_code.column, plan.quantity.column]
    named += [m.column for m in (plan.product_name, plan.stock) if m is not None]
    if plan.unit.column:
        named.append(plan.unit.column)
    if not set(named) <= known:
        raise BusinessRuleError("errors.planColumnUnknown")


async def confirm_plan(
    session: AsyncSession, who: Principal, conversation_id: UUID, body: PlanConfirmation
) -> PlanView:
    row = await _load(session, conversation_id)
    if row.stage not in CONFIRMABLE_STAGES:
        raise ConflictError("errors.planLocked")
    document: dict[str, Any] = dict(row.plan)
    proposed_by = row.proposed_by
    selected_sheet = row.selected_sheet
    if body.plan is None:
        fixed_layout = document["source_kind"] == SourceKind.KARDEX  # no column plan to confirm
        if not document.get("plan") and not fixed_layout:
            raise BusinessRuleError("errors.planIncomplete")
    else:
        if document["source_kind"] == SourceKind.KARDEX:
            raise BusinessRuleError("errors.planNotApplicable")
        _check_against_file(body.plan, row.profile)
        document |= {
            "plan": body.plan.model_dump(mode="json"),
            "summary": None,  # the counts described the previous mapping
            "needs_date_column": False,
            "unmapped_required": [],
        }
        proposed_by, selected_sheet = PlanAuthor.USER.value, body.plan.sheet
    await session.execute(
        _SAVE_PLAN,
        {
            "plan": json.dumps(document),
            "by": proposed_by,
            "user_id": who.user_id,
            "id": row.plan_id,
        },
    )
    await session.execute(_SAVE_SHEET, {"sheet": selected_sheet, "id": row.upload_id})
    await session.execute(_SAVE_STAGE, {"id": conversation_id})
    await audit.log_event(
        session,
        who,
        "plan.confirmed",
        "conversation",
        conversation_id,
        metadata={"corrected": body.plan is not None},
    )
    return _view(await _load(session, conversation_id))
