"""Mock fixtures for the web app: contract-shaped, coherent with the formulas, deterministic."""

import json
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from api.mock_fixtures import build_fixtures, main
from api.schemas import (
    ApiError,
    ChatMessage,
    ChatStreamEvent,
    ConversationDetail,
    ConversationGroup,
    ConversationPage,
    ConversationStage,
    Job,
    PlanView,
    Preferences,
    ProductDetail,
    ProductRow,
    RiskLevel,
    RunSummary,
    User,
)
from api.schemas.enums import StageState

COMMITTED = Path(__file__).resolve().parents[4] / "apps/web/src/services/mock/fixtures"


@pytest.fixture(scope="module")
def fixtures() -> dict:
    return build_fixtures()


def test_the_expected_files_are_produced(fixtures: dict) -> None:
    assert set(fixtures) == {
        "session.json",
        "conversations.json",
        "entry-flow.json",
        "run-summary.json",
        "run-products.json",
        "run-product-details.json",
        "chat.json",
        "errors.json",
    }


def test_build_is_deterministic() -> None:
    assert build_fixtures() == build_fixtures()


def test_session_validates_against_the_contract(fixtures: dict) -> None:
    session = fixtures["session.json"]

    assert User.model_validate(session["user"]).company.name == "Droguería Demo S.A.C."
    assert Preferences.model_validate(session["preferences"]).locale == "es"


class TestConversations:
    def test_every_stage_and_group_is_represented(self, fixtures: dict) -> None:
        page = ConversationPage.model_validate(fixtures["conversations.json"]["page"])

        assert {c.stage for c in page.items} == set(ConversationStage)
        assert {c.group for c in page.items} == set(ConversationGroup)

    def test_details_match_the_list_and_carry_the_upload(self, fixtures: dict) -> None:
        content = fixtures["conversations.json"]
        listed = {c["id"] for c in content["page"]["items"]}
        details = [ConversationDetail.model_validate(d) for d in content["details"]]

        assert {d.id for d in details} == {__import__("uuid").UUID(i) for i in listed}
        assert any(d.upload is not None and d.upload.error_code for d in details)

    def test_ready_conversation_points_at_the_run(self, fixtures: dict) -> None:
        summary = RunSummary.model_validate(fixtures["run-summary.json"])
        ready = [
            ConversationDetail.model_validate(d)
            for d in fixtures["conversations.json"]["details"]
            if d["stage"] == "ready"
        ]

        assert ready
        assert all(d.current_run_id == summary.run.id for d in ready)


class TestEntryFlow:
    def test_jobs_have_exactly_one_active_stage_while_running(self, fixtures: dict) -> None:
        jobs = {k: Job.model_validate(v) for k, v in fixtures["entry-flow.json"]["jobs"].items()}

        for name, job in jobs.items():
            states = [s.state for s in job.stages]
            if job.status == "running":
                assert states.count(StageState.ACTIVE) == 1, name
                assert states == sorted(
                    states, key=[StageState.DONE, StageState.ACTIVE, StageState.PENDING].index
                ), name
            if job.status == "succeeded":
                assert set(states) == {StageState.DONE}, name

    def test_kardex_plan_has_movement_rules_and_tabular_plan_has_mappings(
        self, fixtures: dict
    ) -> None:
        plans = {
            k: PlanView.model_validate(v) for k, v in fixtures["entry-flow.json"]["plans"].items()
        }

        kardex = plans["kardex_proposed"]
        assert kardex.source_kind == "kardex"
        assert {r.code: r.treatment for r in kardex.movement_rules}["01"] == "demand"
        assert {r.code: r.treatment for r in kardex.movement_rules}["02"] == "excluded"
        tabular = plans["tabular_proposed"]
        assert tabular.plan is not None
        assert {m.field for m in tabular.mappings} >= {"date", "product_code", "quantity"}
        assert plans["needs_date_column"].date_column_candidates
        assert plans["needs_date_column"].plan is None

    def test_clarification_asks_at_most_two_questions(self, fixtures: dict) -> None:
        clarification = fixtures["entry-flow.json"]["clarification"]

        assert len(clarification["questions"]) <= 2
        assert {q["id"] for q in clarification["questions"]} == {"lead_time_days", "had_stockouts"}


class TestRun:
    def rows(self, fixtures: dict) -> list[ProductRow]:
        return [ProductRow.model_validate(r) for r in fixtures["run-products.json"]["items"]]

    def test_rows_cover_the_whole_tenant_with_unit_and_risk(self, fixtures: dict) -> None:
        rows = self.rows(fixtures)

        assert len(rows) >= 20
        assert {r.uom for r in rows} == {"kg", "L", "u"}
        assert {r.risk for r in rows} == {"critical", "medium", "optimal"}

    def test_summary_counts_match_the_rows(self, fixtures: dict) -> None:
        summary = RunSummary.model_validate(fixtures["run-summary.json"])
        rows = self.rows(fixtures)
        risks = Counter(r.risk for r in rows)

        assert summary.total_products == len(rows)
        assert summary.risk_distribution.critical == risks[RiskLevel.CRITICAL]
        assert summary.risk_distribution.medium == risks[RiskLevel.MEDIUM]
        assert summary.risk_distribution.optimal == risks[RiskLevel.OPTIMAL]
        assert summary.kpis.products_at_risk.count == risks[RiskLevel.CRITICAL]
        assert summary.kpis.products_at_risk.risk == RiskLevel.CRITICAL
        assert sum(summary.kpis.reliability.distribution.model_dump().values()) == len(rows)

    def test_summary_run_is_fresh_and_has_no_defaults_used(self, fixtures: dict) -> None:
        run = RunSummary.model_validate(fixtures["run-summary.json"]).run

        assert run.data_until == date(2026, 10, 18)
        assert run.stale is False
        assert run.defaults_used == []
        assert run.parameters.horizon_weeks == 12

    def test_series_are_per_unit_of_measure(self, fixtures: dict) -> None:
        summary = RunSummary.model_validate(fixtures["run-summary.json"])

        assert {s.uom for s in summary.series_by_uom} == {"kg", "L", "u"}
        for series in summary.series_by_uom:
            assert any(p.actual is not None for p in series.points)
            assert any(p.expected is not None for p in series.points)

    def test_details_exist_for_every_row_and_are_arithmetically_coherent(
        self, fixtures: dict
    ) -> None:
        rows = {r.code: r for r in self.rows(fixtures)}
        details = {
            code: ProductDetail.model_validate(d)
            for code, d in fixtures["run-product-details.json"].items()
        }

        assert set(details) == set(rows)
        for code, detail in details.items():
            assert detail.product == rows[code]
            for projection in (detail.without_new_purchase, detail.with_suggested_purchase):
                for week in projection.weekly:
                    assert min(week.projected_stock.model_dump().values()) >= 0, code
                    assert (week.status == "stockout") == (week.shortfall.expected > 0), code
                assert len(projection.weekly) == 12
                assert projection.weekly[0].week_start == date(2026, 10, 19)

    def test_with_purchase_projection_receives_the_suggested_quantity_at_the_lead_time(
        self, fixtures: dict
    ) -> None:
        ordering = [
            ProductDetail.model_validate(d)
            for d in fixtures["run-product-details.json"].values()
            if d["purchase"]["suggested_quantity"]["low"] > 0
            and d["product"]["lead_time_days"] <= 84
        ]

        assert ordering
        for detail in ordering:
            arrivals = detail.with_suggested_purchase.arrivals
            lead_weeks = -(-detail.purchase.lead_time_days // 7)
            arrival_date = detail.with_suggested_purchase.weekly[0].week_start + timedelta(
                weeks=lead_weeks - 1
            )
            received = sum(a.quantity for a in arrivals if a.date == arrival_date)
            assert received >= detail.purchase.suggested_quantity.low - 0.01, detail.product.code

    def test_order_today_rows_have_no_buy_before_date(self, fixtures: dict) -> None:
        for row in self.rows(fixtures):
            if row.buy_before.action == "order_today":
                assert row.buy_before.date is None
                assert row.risk == "critical" or row.coverage_weeks.expected is not None


class TestChat:
    def test_messages_validate_and_cover_the_card_kinds(self, fixtures: dict) -> None:
        messages = [ChatMessage.model_validate(m) for m in fixtures["chat.json"]["messages"]]

        assert {m.payload.kind for m in messages} >= {
            "file",
            "mapping",
            "clarification",
            "progress",
            "result",
            "text",
            "error",
        }
        assert any(m.feedback == "up" for m in messages)

    def test_annotation_spans_point_at_the_figure_in_the_text(self, fixtures: dict) -> None:
        summary = RunSummary.model_validate(fixtures["run-summary.json"])
        messages = [ChatMessage.model_validate(m) for m in fixtures["chat.json"]["messages"]]
        annotated = [m for m in messages if m.annotations]

        assert annotated
        for message in annotated:
            for annotation in message.annotations:
                if annotation.type == "filter":
                    span = message.display_text[annotation.start : annotation.end]
                    assert span.startswith(str(annotation.link.count)), span
                    if annotation.link.risk == "critical":
                        assert annotation.link.count == summary.kpis.products_at_risk.count

    def test_stream_example_rebuilds_the_final_text(self, fixtures: dict) -> None:
        adapter = TypeAdapter(ChatStreamEvent)
        events = [adapter.validate_python(e) for e in fixtures["chat.json"]["stream_example"]]
        names = [e.event for e in events]

        assert names[0] == "message.start"
        assert names[-1] == "message.end"
        assert {"text.delta", "tool.start", "tool.end", "annotation"} <= set(names)
        text = "".join(e.text for e in events if e.event == "text.delta")
        assert text == fixtures["chat.json"]["stream_example_text"]


def test_errors_are_problem_details(fixtures: dict) -> None:
    errors = {k: ApiError.model_validate(v) for k, v in fixtures["errors.json"].items()}

    assert {"not_found", "validation", "rate_limited", "failure"} <= set(errors)
    assert errors["validation"].fields
    assert all(e.ref for e in errors.values())


def test_main_writes_every_file_idempotently(tmp_path: Path) -> None:
    assert main(["--out", str(tmp_path)]) == 0
    first = {p.name: p.read_text(encoding="utf-8") for p in tmp_path.iterdir()}
    assert main(["--out", str(tmp_path)]) == 0

    assert {p.name: p.read_text(encoding="utf-8") for p in tmp_path.iterdir()} == first
    assert set(first) == set(build_fixtures())
    assert all(json.loads(text) is not None for text in first.values())


@pytest.mark.skipif(not COMMITTED.exists(), reason="web fixtures not present")
def test_committed_fixtures_match_the_generator(fixtures: dict) -> None:
    """Fails on drift: run `make fixtures` and commit the result."""
    for name, content in fixtures.items():
        assert json.loads((COMMITTED / name).read_text(encoding="utf-8")) == content, name
