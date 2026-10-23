"""`GET /v1/runs/{id}/products`: the portfolio table (filter, search, sort, paginate)."""

from __future__ import annotations

from uuid import uuid4

import pytest

from .conftest import World, new_side
from .runs_support import Spec, add_run, lima_today, portfolio


def table(world: World, run, query: str = "") -> dict:
    response = world.client.get(f"/v1/runs/{run.run}/products{query}", headers=world.headers())
    assert response.status_code == 200, response.text
    return response.json()


def codes(page: dict) -> list[str]:
    return [item["code"] for item in page["items"]]


@pytest.fixture
def run(world: World):
    return add_run(world, portfolio())


class TestRow:
    def test_every_figure_comes_from_the_stored_metrics(self, world: World, run) -> None:
        first = table(world, run)["items"][0]

        assert first == {
            "code": "QF-1001",
            "name": "Ácido cítrico",
            "uom": "kg",
            "abc_class": "A",
            "typical_demand": {"low": 15.0, "expected": 20.0, "high": 28.0},
            "current_stock": 30.0,
            "coverage_weeks": {"lower": 1.07, "expected": 1.5, "upper": 2.0},
            "risk": "critical",
            "reliability": "high",
            "stockout_date": "2026-10-26",
            "suggested_quantity": {"low": 90.0, "high": 106.0},
            "suggested_truncated": False,
            "buy_before": {
                "action": "order_today",
                "date": None,
                "earliest_date": lima_today().isoformat(),
                "weeks_without_stock": 0.5,
            },
            "lead_time_days": 14,
            "lead_time_overridden": False,
            "target_coverage_weeks": 4,
            "on_order_quantity": 0.0,
        }

    def test_a_product_without_stockout_has_null_coverage_and_dates(
        self, world: World, run
    ) -> None:
        row = next(i for i in table(world, run)["items"] if i["code"] == "QF-1003")

        assert row["coverage_weeks"] == {"lower": None, "expected": None, "upper": None}
        assert row["stockout_date"] is None
        assert row["buy_before"]["action"] == "no_stockout"
        assert row["buy_before"]["date"] is None
        assert row["risk"] == "optimal"
        assert row["reliability"] == "low"

    def test_order_by_date_carries_the_date(self, world: World) -> None:
        run = add_run(world, [Spec("QF-3001", stock=70.0, weekly=20.0, lead_days=14)])

        row = table(world, run)["items"][0]

        assert row["buy_before"]["action"] == "order_by_date"
        assert row["buy_before"]["date"] is not None
        assert row["risk"] == "medium"


class TestFilters:
    def test_default_order_is_the_most_critical_first(self, world: World, run) -> None:
        page = table(world, run)

        assert codes(page) == ["QF-1001", "QF-1002", "QF-1003"]
        assert (page["page"], page["page_size"], page["total"], page["total_unfiltered"]) == (
            1,
            25,
            3,
            3,
        )

    def test_risk_filter_accepts_several_values(self, world: World, run) -> None:
        page = table(world, run, "?risk=critical&risk=optimal")

        assert codes(page) == ["QF-1001", "QF-1003"]
        assert page["total"] == 2
        assert page["total_unfiltered"] == 3

    def test_abc_filter(self, world: World, run) -> None:
        assert codes(table(world, run, "?abc=B")) == ["QF-1002"]

    @pytest.mark.parametrize(
        ("q", "expected"),
        [
            ("acido", ["QF-1001"]),
            ("ÁCIDO", ["QF-1001"]),
            ("cítrico", ["QF-1001"]),
            ("qf-1002", ["QF-1002"]),
            ("BICARB", ["QF-1003"]),
            ("1003", ["QF-1003"]),
            ("nothing", []),
        ],
    )
    def test_search_matches_code_and_name_ignoring_accents_and_case(
        self,
        world: World,
        run,
        q: str,
        expected: list[str],
    ) -> None:
        assert codes(table(world, run, f"?q={q}")) == expected

    def test_search_treats_wildcards_literally(self, world: World, run) -> None:
        assert codes(table(world, run, "?q=%25")) == []
        assert codes(table(world, run, "?q=_")) == []

    def test_filters_combine(self, world: World, run) -> None:
        assert codes(table(world, run, "?risk=critical&abc=B")) == []


class TestSort:
    @pytest.mark.parametrize(
        ("sort", "order", "expected"),
        [
            ("name", "asc", ["QF-1001", "QF-1003", "QF-1002"]),  # "Ácido" sorts as "acido"
            ("name", "desc", ["QF-1002", "QF-1003", "QF-1001"]),
            ("abc_class", "desc", ["QF-1003", "QF-1002", "QF-1001"]),
            ("current_stock", "asc", ["QF-1001", "QF-1002", "QF-1003"]),
            ("current_stock", "desc", ["QF-1003", "QF-1002", "QF-1001"]),
            ("coverage", "asc", ["QF-1001", "QF-1002", "QF-1003"]),  # no stockout sorts last
            ("coverage", "desc", ["QF-1003", "QF-1002", "QF-1001"]),
            ("risk", "desc", ["QF-1003", "QF-1002", "QF-1001"]),
            ("suggested_quantity", "desc", ["QF-1001", "QF-1002", "QF-1003"]),
            ("lead_time", "asc", ["QF-1001", "QF-1002", "QF-1003"]),  # ties break on code
            ("typical_demand", "asc", ["QF-1001", "QF-1002", "QF-1003"]),
            ("buy_before", "asc", ["QF-1001", "QF-1002", "QF-1003"]),
            ("buy_before", "desc", ["QF-1003", "QF-1002", "QF-1001"]),
        ],
    )
    def test_sort_and_direction(
        self,
        world: World,
        run,
        sort: str,
        order: str,
        expected: list[str],
    ) -> None:
        assert codes(table(world, run, f"?sort={sort}&order={order}")) == expected

    def test_unknown_sort_fields_are_rejected(self, world: World, run) -> None:
        response = world.client.get(
            f"/v1/runs/{run.run}/products?sort=password", headers=world.headers()
        )

        assert response.status_code == 422


class TestPagination:
    def test_pages_cover_the_whole_table_once(self, world: World) -> None:
        specs = [Spec(f"QF-{5000 + i}", name=f"P{i:02d}", stock=1000.0 + i) for i in range(7)]
        run = add_run(world, specs)

        pages = [table(world, run, f"?sort=name&page={n}&page_size=3") for n in (1, 2, 3, 4)]

        assert [len(p["items"]) for p in pages] == [3, 3, 1, 0]
        assert [c for p in pages for c in codes(p)] == [f"QF-{5000 + i}" for i in range(7)]
        assert {p["total"] for p in pages} == {7}

    @pytest.mark.parametrize("query", ["?page=0", "?page_size=0", "?page_size=101", "?risk=bogus"])
    def test_bad_paging_or_filters_are_a_422(self, world: World, run, query: str) -> None:
        response = world.client.get(f"/v1/runs/{run.run}/products{query}", headers=world.headers())

        assert response.status_code == 422


class TestAccess:
    def test_another_tenants_run_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.get(f"/v1/runs/{other.run}/products", headers=world.headers())

        assert response.status_code == 404

    def test_a_run_never_shows_another_runs_products(self, world: World, run) -> None:
        add_run(world, [Spec("QF-9001", name="Otro")])

        assert "QF-9001" not in codes(table(world, run))

    def test_unknown_run_and_missing_token(self, world: World) -> None:
        assert (
            world.client.get(f"/v1/runs/{uuid4()}/products", headers=world.headers()).status_code
            == 404
        )
        assert world.client.get(f"/v1/runs/{uuid4()}/products").status_code == 401
