"""D17-C: when the file has no stock, nothing that depends on stock is shown (no risk, coverage,
suggested purchase or buy-before). Demand, reliability and the forecast range still are."""

from __future__ import annotations

import io
from typing import Any

import pytest
from openpyxl import load_workbook

from .conftest import World
from .runs_support import add_run, portfolio

NO_STOCK = {"stock_known": False, "defaults_used": ["stockout_censoring"]}


@pytest.fixture
def blind(world: World):
    return add_run(world, portfolio(), params=NO_STOCK)


def get(world: World, path: str) -> Any:
    response = world.client.get(path, headers=world.headers())
    assert response.status_code == 200, response.text
    return response.json()


class TestSummary:
    def test_risk_and_coverage_are_not_reported(self, world: World, blind) -> None:
        body = get(world, f"/v1/runs/{blind.run}/summary")

        assert body["stock_known"] is False
        assert body["risk_distribution"] is None
        assert body["kpis"]["products_at_risk"] is None
        assert body["kpis"]["average_coverage_weeks"] is None
        assert body["total_products"] == 3
        assert body["kpis"]["reliability"]["overall"] in {"high", "medium", "low"}
        assert {s["uom"] for s in body["series_by_uom"]} == {"kg", "l"}

    def test_a_run_with_stock_is_unchanged(self, world: World) -> None:
        run = add_run(world, portfolio())

        body = get(world, f"/v1/runs/{run.run}/summary")

        assert body["risk_distribution"] == {"critical": 1, "medium": 1, "optimal": 1}
        assert body["kpis"]["products_at_risk"]["count"] == 1
        assert body["kpis"]["average_coverage_weeks"] is not None


class TestTable:
    def test_rows_keep_demand_and_reliability_and_drop_what_depends_on_stock(
        self, world: World, blind
    ) -> None:
        rows = get(world, f"/v1/runs/{blind.run}/products")["items"]

        first = next(r for r in rows if r["code"] == "QF-1001")
        assert first["typical_demand"] == {"low": 15.0, "expected": 20.0, "high": 28.0}
        assert first["reliability"] == "high"
        assert first["abc_class"] == "A"
        for field in (
            "risk",
            "current_stock",
            "coverage_weeks",
            "stockout_date",
            "suggested_quantity",
            "buy_before",
        ):
            assert first[field] is None, field

    def test_filtering_by_risk_is_refused_because_there_is_no_risk(
        self, world: World, blind
    ) -> None:
        response = world.client.get(
            f"/v1/runs/{blind.run}/products?risk=critical", headers=world.headers()
        )

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.stockUnknown"

    @pytest.mark.parametrize(
        "sort", ["risk", "coverage", "current_stock", "suggested_quantity", "buy_before"]
    )
    def test_sorting_by_a_stock_field_falls_back_to_the_name(
        self, world: World, blind, sort: str
    ) -> None:
        asc = get(world, f"/v1/runs/{blind.run}/products?sort={sort}&order=asc")["items"]
        desc = get(world, f"/v1/runs/{blind.run}/products?sort={sort}&order=desc")["items"]

        assert [r["code"] for r in asc] == ["QF-1001", "QF-1003", "QF-1002"]
        assert [r["code"] for r in desc] == ["QF-1002", "QF-1003", "QF-1001"]

    def test_demand_sorting_and_search_still_work(self, world: World, blind) -> None:
        found = get(world, f"/v1/runs/{blind.run}/products?q=acido&sort=typical_demand")["items"]

        assert [r["code"] for r in found] == ["QF-1001"]


class TestDetail:
    def test_the_forecast_is_there_and_the_stock_projections_are_not(
        self, world: World, blind
    ) -> None:
        body = get(world, f"/v1/runs/{blind.run}/products/QF-1001")

        assert body["purchase"] is None
        assert body["without_new_purchase"] is None
        assert body["with_suggested_purchase"] is None
        assert body["product"]["risk"] is None
        assert body["reliability"]["level"] == "high"
        forecast = body["forecast"]
        assert len(forecast["weekly"]) == 12
        assert forecast["weekly"][0] == {
            "week": 1,
            "week_start": "2026-10-19",
            "demand": {"low": 15.0, "expected": 20.0, "high": 28.0},
        }
        history = [p for p in forecast["series"] if p["actual"] is not None]
        future = [p for p in forecast["series"] if p["expected"] is not None]
        assert len(history) == 6
        assert len(future) == 12
        assert all(p["projected_stock"] is None for p in future)

    def test_with_stock_the_detail_also_carries_the_forecast(self, world: World) -> None:
        run = add_run(world, portfolio())

        body = get(world, f"/v1/runs/{run.run}/products/QF-1001")

        assert body["forecast"]["weekly"][0]["demand"]["expected"] == 20.0
        assert body["without_new_purchase"] is not None
        assert body["purchase"] is not None

    def test_simulating_needs_stock(self, world: World, blind) -> None:
        response = world.client.post(
            f"/v1/runs/{blind.run}/products/QF-1001/simulate",
            json={"lead_time_days": 7},
            headers=world.headers(),
        )

        assert response.status_code == 409
        assert response.json()["message_key"] == "errors.stockUnknown"


class TestExport:
    def test_the_sheet_has_no_stock_columns(self, world: World, blind) -> None:
        response = world.client.post(
            f"/v1/runs/{blind.run}/exports", json={"scope": "all"}, headers=world.headers()
        )

        path = next(iter(world.storage.objects))
        sheet = load_workbook(io.BytesIO(world.storage.objects[path])).active
        headers = [c.value for c in sheet[1]]
        assert response.status_code == 201
        assert headers == [
            "Código",
            "Producto",
            "Unidad",
            "Clase ABC",
            "Demanda típica semanal",
            "Fiabilidad",
        ]
        assert sheet.max_row == 4
