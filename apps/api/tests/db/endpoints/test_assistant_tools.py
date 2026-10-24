"""The assistant's tools: read-only views of one run, every figure handed out by reference."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from api.assistant.figures import Refs
from api.auth import Principal, Tx
from api.container import Container
from api.db.context import RequestContext
from api.db.engine import create_engine
from api.services.assistant_tools import TOOL_SPECS, Toolbox

from .conftest import World, new_side
from .runs_support import Spec, add_run, portfolio


@pytest.fixture
async def engine(api_url: str):
    engine = create_engine(api_url)
    yield engine
    await engine.dispose()


def toolbox(engine: AsyncEngine, world: World, run, turn: int = 7) -> tuple[Toolbox, Refs]:
    ctx = RequestContext(world.side.user, {"role": "authenticated"}, request_id="r1")
    who = Principal(ctx, world.side.tenant, "owner", world.side.email)
    refs = Refs(turn)
    container = Container(engine=engine, verifier=None, storage=None, spawner=None)  # ty: ignore[invalid-argument-type]
    return Toolbox(Tx(who, container), run.run, refs), refs


async def call(box: Toolbox, name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    result = await box.execute(name, args or {})
    json.dumps(result)  # tool results are JSON
    return result


@pytest.fixture
def run(world: World):
    return add_run(world, portfolio())


class TestSpecs:
    def test_there_are_six_strict_read_only_tools(self) -> None:
        assert [t["name"] for t in TOOL_SPECS] == [
            "get_run_summary",
            "find_products",
            "get_product_detail",
            "simulate_purchase",
            "get_parameters",
            "explain_reliability",
        ]
        for spec in TOOL_SPECS:
            assert spec["strict"] is True
            assert spec["input_schema"]["type"] == "object"
            assert spec["input_schema"]["additionalProperties"] is False
            assert spec["description"]

    def test_the_list_is_frozen_for_caching(self) -> None:
        assert json.dumps(TOOL_SPECS, sort_keys=True) == json.dumps(TOOL_SPECS, sort_keys=True)
        assert isinstance(TOOL_SPECS, tuple)


class TestRunSummary:
    async def test_counts_come_back_as_figures_with_filter_links(self, engine, world, run) -> None:
        box, refs = toolbox(engine, world, run)

        result = await call(box, "get_run_summary")

        critical = result["critical_products"]
        assert critical["id"] == "f7_1" or critical["id"].startswith("f7_")
        assert critical["value"] == 1
        assert critical["unit"] == "count"
        assert critical["filter"]["risk"] == "critical"
        assert result["total_products"]["value"] == 3
        assert result["average_coverage_weeks"]["unit"] == "weeks"
        assert result["data_until"]["value"] == "2026-10-18"
        assert result["data_until"]["unit"] == "date"
        assert result["stale"] in (True, False)
        assert result["stock_known"] is True
        assert result["defaults_used"] == []
        assert refs.resolve_figure(critical["id"]) is not None

    async def test_every_number_in_the_result_is_a_referenced_figure(
        self, engine, world, run
    ) -> None:
        box, refs = toolbox(engine, world, run)

        result = await call(box, "get_run_summary")

        def bare_numbers(node: Any, path: str = "") -> list[str]:
            if isinstance(node, dict):
                if "id" in node and "unit" in node:
                    assert refs.resolve_figure(node["id"]) is not None
                    return []
                return [p for k, v in node.items() for p in bare_numbers(v, f"{path}.{k}")]
            if isinstance(node, list):
                return [p for v in node for p in bare_numbers(v, path)]
            return [path] if isinstance(node, int | float) and not isinstance(node, bool) else []

        assert bare_numbers(result) == []


class TestFindProducts:
    async def test_returns_products_by_reference_most_critical_first(
        self, engine, world, run
    ) -> None:
        box, refs = toolbox(engine, world, run)

        result = await call(box, "find_products")

        assert [p["product"]["code"] for p in result["products"]] == [
            "QF-1001",
            "QF-1002",
            "QF-1003",
        ]
        first = result["products"][0]
        assert refs.resolve_product(first["product"]["id"]).code == "QF-1001"  # ty: ignore[unresolved-attribute]
        assert first["risk"] == "critical"
        assert first["current_stock"]["unit"] == "quantity"
        assert first["current_stock"]["uom"] == "kg"
        assert first["current_stock"]["value"] == 30.0
        assert first["coverage_weeks"]["value"] == 1.5
        assert first["suggested_min"]["value"] == 90.0
        assert result["total_matching"]["value"] == 3

    async def test_a_product_without_stockout_has_no_coverage_figure(
        self, engine, world, run
    ) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "find_products", {"query": "bicarbonato"})

        [product] = result["products"]
        assert product["coverage_weeks"] is None
        assert product["no_stockout_in_horizon"] is True
        assert product["buy_before"] == {"action": "no_stockout", "date": None}

    async def test_filters_and_the_link_that_matches_them(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "find_products", {"risk": "medium", "abc": "B", "query": "glic"})

        assert [p["product"]["code"] for p in result["products"]] == ["QF-1002"]
        link = result["total_matching"]["filter"]
        assert (link["risk"], link["abc"], link["q"], link["count"]) == ("medium", "B", "glic", 1)

    async def test_the_limit_is_honoured_and_the_total_is_not_truncated(
        self, engine, world, run
    ) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "find_products", {"limit": 2})

        assert len(result["products"]) == 2
        assert result["total_matching"]["value"] == 3

    async def test_buy_before_dates_are_figures(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "find_products", {"risk": "medium"})

        buy = result["products"][0]["buy_before"]
        assert buy["action"] == "order_by_date"
        assert buy["date"]["unit"] == "date"

    @pytest.mark.parametrize(
        "args",
        [{"limit": 11}, {"limit": 0}, {"risk": "scary"}, {"sort": "password"}, {"extra": 1}],
    )
    async def test_invalid_input_is_an_error_result_not_an_exception(
        self, engine, world, run, args: dict
    ) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "find_products", args)

        assert result["error"] == "invalid_input"


class TestProductTools:
    async def test_detail_is_a_card_of_figures(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "get_product_detail", {"code": "QF-1001"})

        assert result["product"]["code"] == "QF-1001"
        assert result["risk"] == "critical"
        assert result["lead_time_days"] == {
            **result["lead_time_days"],
            "value": 14,
            "unit": "days",
        }
        assert result["reliability_level"] == "high"
        assert result["backtest_error_pct"]["unit"] == "percent"
        assert result["stockout_date"]["unit"] == "date"
        assert result["suggested_max"]["value"] == 106.0

    async def test_unknown_products_are_an_error_result(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        assert (await call(box, "get_product_detail", {"code": "NOPE"}))["error"] == "not_found"

    async def test_simulation_reports_the_what_if_without_saving(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(
            box,
            "simulate_purchase",
            {"code": "QF-1002", "lead_time_days": 7, "with_purchase": True},
        )

        assert result["risk"] == "optimal"
        assert result["lead_time_days"]["value"] == 7
        assert result["arrivals"][0]["quantity"]["unit"] == "quantity"
        assert result["weeks_in_stockout"]["unit"] == "count"
        assert result["weeks_in_stockout"]["value"] == 7  # the purchase covers five weeks

    async def test_explain_reliability(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        model = await call(box, "explain_reliability", {"code": "QF-1001"})
        simple = await call(box, "explain_reliability", {"code": "QF-1003"})

        assert model["method"] == "model"
        assert model["history_weeks"]["value"] == 6
        assert model["non_censored_weeks"]["value"] == 5
        assert model["backtest_error_pct"]["value"] == 22.0
        assert simple["method"] == "simple"
        assert simple["backtest_error_pct"] is None
        assert simple["level"] == "low"

    async def test_parameters(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "get_parameters")

        assert result["lead_time_days"]["value"] == 14
        assert result["horizon_weeks"]["value"] == 12
        assert result["target_coverage_weeks"]["unit"] == "weeks"
        assert result["critical_margin_weeks"]["value"] == 0.0
        assert result["medium_margin_weeks"]["value"] == 2.0
        assert result["parameters_pending"] is False


class TestSafety:
    async def test_an_unknown_tool_is_an_error_result(self, engine, world, run) -> None:
        box, _ = toolbox(engine, world, run)

        assert (await call(box, "delete_everything"))["error"] == "unknown_tool"

    async def test_another_tenants_run_is_not_found(self, engine, world, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")
        box = toolbox(engine, world, type("R", (), {"run": other.run}))[0]

        assert (await call(box, "get_run_summary"))["error"] == "not_found"
        assert (await call(box, "find_products"))["error"] == "not_found"

    async def test_a_code_of_another_run_is_not_found(self, engine, world, run) -> None:
        other_run = add_run(world, [Spec("QF-9500")])
        box, _ = toolbox(engine, world, run)

        assert (await call(box, "get_product_detail", {"code": "QF-9500"}))["error"] == "not_found"
        assert other_run.run != run.run

    async def test_unexpected_failures_never_leak_details(
        self, engine, world, run, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def boom(*_a: object, **_k: object) -> None:
            raise RuntimeError("password=hunter2")

        monkeypatch.setattr("api.services.runs.get_summary", boom)
        box, _ = toolbox(engine, world, run)

        result = await call(box, "get_run_summary")

        assert result == {"error": "tool_failed"}

    async def test_the_tool_never_takes_a_tenant_or_run_from_the_model(
        self, engine, world, run
    ) -> None:
        box, _ = toolbox(engine, world, run)

        result = await call(box, "get_run_summary", {"run_id": str(uuid4())})

        assert result["error"] == "invalid_input"
