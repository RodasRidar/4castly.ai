"""`GET/PUT /v1/conversations/{id}/plan`: what the confirmation screen shows and confirms."""

from __future__ import annotations

from copy import deepcopy
from uuid import UUID

import psycopg
import pytest

from .conftest import (
    SUMMARY,
    TABULAR_PLAN,
    TABULAR_PROFILE,
    World,
    add_conversation,
    add_plan,
    fetch_row,
    new_side,
    tabular_document,
)


def url(conversation: UUID) -> str:
    return f"/v1/conversations/{conversation}/plan"


def view(world: World, conversation: UUID) -> dict:
    response = world.client.get(url(conversation), headers=world.headers())
    assert response.status_code == 200, response.text
    return response.json()


def confirm(world: World, conversation: UUID, body: dict | None = None):
    return world.client.put(url(conversation), json=body or {}, headers=world.headers())


def stored(world: World, conversation: UUID) -> tuple:
    with psycopg.connect(world.dsn) as admin:
        return fetch_row(
            admin,
            "select p.plan, p.proposed_by, p.confirmed_at is not null, p.confirmed_by, "
            "c.stage, u.selected_sheet from public.normalization_plans p "
            "join public.uploads u on u.id = p.upload_id "
            "join public.conversations c on c.id = u.conversation_id where c.id = %s",
            [conversation],
        )


class TestGetPlan:
    def test_a_proposed_tabular_plan_with_its_mapping_card(self, world: World) -> None:
        body = view(world, add_plan(world))

        assert body["source_kind"] == "tabular"
        assert body["status"] == "proposed"
        assert body["proposed_by"] == "llm"
        assert body["sheets"] == ["Ventas", "Resumen"]
        assert body["selected_sheet"] == "Ventas"
        assert body["plan"] == TABULAR_PLAN
        assert body["summary"] == SUMMARY
        assert body["movement_rules"] == []
        assert body["warnings"] == [
            {"code": "dropped_rows", "severity": "info", "count": 12, "params": {}}
        ]
        mappings = {m["field"]: m for m in body["mappings"]}
        assert list(mappings) == [
            "date",
            "product_code",
            "product_name",
            "quantity",
            "stock",
            "unit",
        ]
        assert mappings["date"] == {
            "field": "date",
            "column": "Fecha Doc",
            "required": True,
            "samples": ["12/01/2026"],
            "detail": "dd/mm/yyyy",
        }
        assert mappings["quantity"]["samples"] == ["1.850,5", "320"]
        assert mappings["quantity"]["detail"] == "decimal ,"
        assert mappings["stock"]["column"] is None
        assert mappings["stock"]["required"] is False
        assert mappings["product_name"]["required"] is False

    def test_a_confirmed_plan_says_so(self, world: World) -> None:
        body = view(world, add_plan(world, stage="confirmed", proposed_by="user", confirmed=True))

        assert body["status"] == "confirmed"
        assert body["proposed_by"] == "user"

    def test_a_kardex_has_movement_rules_and_no_column_mapping(self, world: World) -> None:
        rules = [{"code": "01", "label": "Venta", "treatment": "demand"}]
        document = tabular_document(source_kind="kardex", plan=None, movement_rules=rules)
        profile = {"source_kind": "kardex", "sheets": [], "date_from": None, "date_to": None}

        body = view(
            world,
            add_plan(
                world,
                document=document,
                profile=profile,
                sheets=["Kardex"],
                selected_sheet="Kardex",
                proposed_by="rules",
            ),
        )

        assert body["source_kind"] == "kardex"
        assert body["plan"] is None
        assert body["mappings"] == []
        assert body["movement_rules"] == rules
        assert body["proposed_by"] == "rules"

    def test_a_file_without_dates_asks_for_a_date_column(self, world: World) -> None:
        candidates = [{"column": "Periodo", "samples": ["2026-01"]}]
        document = tabular_document(
            plan=None,
            summary=None,
            needs_date_column=True,
            date_column_candidates=candidates,
            unmapped_required=[],
        )

        body = view(world, add_plan(world, stage="needs_date_column", document=document))

        assert body["plan"] is None
        assert body["summary"] is None
        assert body["date_column_candidates"] == candidates
        assert body["mappings"] == [
            {"field": "date", "column": None, "required": True, "samples": [], "detail": None}
        ]

    def test_unmapped_required_fields_appear_without_a_column(self, world: World) -> None:
        document = tabular_document(plan=None, unmapped_required=["product_code", "quantity"])

        body = view(world, add_plan(world, document=document))

        assert [(m["field"], m["column"]) for m in body["mappings"]] == [
            ("product_code", None),
            ("quantity", None),
        ]

    def test_a_conversation_without_a_plan_yet_is_a_404(self, world: World) -> None:
        conversation = add_conversation(world, stage="digesting")

        assert world.client.get(url(conversation), headers=world.headers()).status_code == 404

    def test_another_tenants_plan_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.get(url(other.conversation), headers=world.headers())

        assert response.status_code == 404

    def test_requires_authentication(self, world: World) -> None:
        assert world.client.get(url(world.side.conversation)).status_code == 401


class TestConfirmPlan:
    def test_confirming_as_is_keeps_the_proposal_and_moves_the_conversation_on(
        self, world: World
    ) -> None:
        conversation = add_plan(world)

        response = confirm(world, conversation)

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "confirmed"
        assert body["plan"] == TABULAR_PLAN
        assert body["summary"] == SUMMARY
        plan, proposed_by, confirmed, confirmed_by, stage, _ = stored(world, conversation)
        assert plan["plan"] == TABULAR_PLAN
        assert (proposed_by, confirmed, confirmed_by, stage) == (
            "llm",
            True,
            world.side.user,
            "clarifying",
        )

    def test_a_corrected_plan_replaces_the_proposal_and_is_attributed_to_the_user(
        self, world: World
    ) -> None:
        conversation = add_plan(world)
        corrected = deepcopy(TABULAR_PLAN)
        corrected["quantity"] = {"column": "Stock", "decimal_separator": "."}
        corrected["stock"] = None

        response = confirm(world, conversation, {"plan": corrected})

        assert response.status_code == 200
        assert response.json()["plan"]["quantity"]["column"] == "Stock"
        assert response.json()["proposed_by"] == "user"
        plan, proposed_by, confirmed, _, stage, _ = stored(world, conversation)
        assert plan["plan"] == corrected
        assert plan["summary"] is None  # the old counts described the old mapping
        assert plan["needs_date_column"] is False
        assert (proposed_by, confirmed, stage) == ("user", True, "clarifying")

    def test_the_stored_document_keeps_the_shape_the_worker_reads(self, world: World) -> None:
        conversation = add_plan(world)
        confirm(world, conversation, {"plan": TABULAR_PLAN})

        plan = stored(world, conversation)[0]

        assert set(plan) == set(tabular_document())
        assert set(plan["plan"]) == set(TABULAR_PLAN)

    def test_choosing_another_sheet_updates_the_selected_sheet(self, world: World) -> None:
        profile = deepcopy(TABULAR_PROFILE)
        profile["sheets"][1]["columns"] = profile["sheets"][0]["columns"]
        conversation = add_plan(world, profile=profile)
        corrected = {**TABULAR_PLAN, "sheet": "Resumen"}

        assert confirm(world, conversation, {"plan": corrected}).status_code == 200
        assert stored(world, conversation)[5] == "Resumen"

    def test_a_file_without_a_date_column_can_be_fixed_by_picking_one(self, world: World) -> None:
        document = tabular_document(plan=None, summary=None, needs_date_column=True)
        conversation = add_plan(world, stage="needs_date_column", document=document)

        response = confirm(world, conversation, {"plan": TABULAR_PLAN})

        assert response.status_code == 200
        assert stored(world, conversation)[4] == "clarifying"

    def test_confirming_as_is_without_a_usable_plan_is_a_422(self, world: World) -> None:
        document = tabular_document(plan=None, needs_date_column=True)
        conversation = add_plan(world, stage="needs_date_column", document=document)

        response = confirm(world, conversation)

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.planIncomplete"
        assert stored(world, conversation)[2] is False

    def test_a_plan_without_a_date_column_cannot_be_confirmed(self, world: World) -> None:
        conversation = add_plan(world)

        response = confirm(world, conversation, {"plan": {**TABULAR_PLAN, "date": None}})

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.planIncomplete"

    @pytest.mark.parametrize(
        "change",
        [
            {"sheet": "Nope"},
            {"product_code": {"column": "Missing"}},
            {"quantity": {"column": "Missing", "decimal_separator": "."}},
            {"date": {"column": "Missing", "format": "dd/mm/yyyy"}},
            {"stock": {"column": "Missing", "decimal_separator": "."}},
        ],
    )
    def test_columns_must_exist_in_the_file(self, world: World, change: dict) -> None:
        conversation = add_plan(world)

        response = confirm(world, conversation, {"plan": {**TABULAR_PLAN, **change}})

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.planColumnUnknown"
        assert stored(world, conversation)[2] is False

    def test_a_kardex_has_no_column_plan_to_correct(self, world: World) -> None:
        document = tabular_document(source_kind="kardex", plan=None)
        profile = {"source_kind": "kardex", "sheets": [], "date_from": None, "date_to": None}
        conversation = add_plan(world, document=document, profile=profile, proposed_by="rules")

        assert confirm(world, conversation, {"plan": TABULAR_PLAN}).status_code == 422
        assert confirm(world, conversation).status_code == 200

    @pytest.mark.parametrize("stage", ["digesting", "calculating", "ready", "failed"])
    def test_only_the_confirmation_stages_accept_a_plan(self, world: World, stage: str) -> None:
        conversation = add_plan(world, stage=stage)

        assert confirm(world, conversation).status_code == 409

    def test_unknown_fields_are_rejected(self, world: World) -> None:
        conversation = add_plan(world)

        response = confirm(world, conversation, {"plan": TABULAR_PLAN, "extra": 1})

        assert response.status_code == 422

    def test_confirmation_is_a_business_audit_event(self, world: World) -> None:
        conversation = add_plan(world)
        confirm(world, conversation)

        with psycopg.connect(world.dsn) as admin:
            row = fetch_row(
                admin,
                "select action, actor_id from audit.events where target_id = %s",
                [str(conversation)],
            )
        assert row == ("plan.confirmed", world.side.user)

    def test_another_tenants_conversation_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        assert confirm(world, other.conversation).status_code == 404
