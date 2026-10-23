"""Product detail and what-if simulation: the formulas package over the stored forecast."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import inventory as inv
import psycopg
import pytest

from .conftest import World, fetch_row, new_side
from .runs_support import DATA_UNTIL, HORIZON, Spec, add_run, lima_today, portfolio


def detail(world: World, run, code: str = "QF-1001"):
    return world.client.get(f"/v1/runs/{run.run}/products/{code}", headers=world.headers())


def simulate(world: World, run, body: dict, code: str = "QF-1002"):
    return world.client.post(
        f"/v1/runs/{run.run}/products/{code}/simulate", json=body, headers=world.headers()
    )


def expected_weekly(spec: Spec, *, purchase: float | None = None) -> list[dict]:
    """What `inventory` says for this spec, in the contract's shape."""
    inputs = spec.inputs()
    if purchase is not None:
        inputs = inv.with_purchase(inputs, purchase)
    a = inv.analyze_product(inputs)
    return [
        {
            "week": w,
            "stock": [
                round(x, 1)
                for x in (a.low.stock[w - 1], a.expected.stock[w - 1], a.high.stock[w - 1])
            ],
            "shortfall": round(a.expected.shortfall[w - 1], 1),
        }
        for w in range(1, HORIZON + 1)
    ]


@pytest.fixture
def run(world: World):
    return add_run(world, portfolio())


class TestDetail:
    def test_the_header_cards_match_the_table_row(self, world: World, run) -> None:
        row = next(
            i
            for i in world.client.get(
                f"/v1/runs/{run.run}/products", headers=world.headers()
            ).json()["items"]
            if i["code"] == "QF-1001"
        )

        body = detail(world, run).json()

        assert body["product"] == row
        assert body["data_until"] == DATA_UNTIL.isoformat()
        assert body["today"] == lima_today().isoformat()
        assert body["purchase"] == {
            "lead_time_days": 14,
            "target_coverage_weeks": 4,
            "suggested_quantity": row["suggested_quantity"],
            "truncated": False,
            "buy_before": row["buy_before"],
        }

    def test_reliability_explains_the_method_and_the_backtest(self, world: World, run) -> None:
        model = detail(world, run, "QF-1001").json()["reliability"]
        simple = detail(world, run, "QF-1003").json()["reliability"]

        assert model == {
            "level": "high",
            "method": "model",
            "history_weeks": 6,
            "non_censored_weeks": 5,
            "backtest_error_pct": 22.0,
        }
        assert simple["method"] == "simple"
        assert simple["backtest_error_pct"] is None

    def test_the_weekly_table_is_the_formulas_applied_to_the_stored_forecast(
        self,
        world: World,
        run,
    ) -> None:
        spec = portfolio()[0]
        weekly = detail(world, run).json()["without_new_purchase"]["weekly"]

        assert len(weekly) == HORIZON
        for row, oracle in zip(weekly, expected_weekly(spec), strict=True):
            assert row["week"] == oracle["week"]
            assert [
                row["projected_stock"]["low"],
                row["projected_stock"]["expected"],
                row["projected_stock"]["high"],
            ] == oracle["stock"]
            assert row["shortfall"]["expected"] == oracle["shortfall"]
        first = weekly[0]
        assert first["week_start"] == "2026-10-19"
        assert first["demand"] == {"low": 15.0, "expected": 20.0, "high": 28.0}
        assert first["status"] == "in_stock"
        assert weekly[3]["status"] == "stockout"

    def test_the_series_has_history_then_forecast_with_censored_weeks(
        self,
        world: World,
        run,
    ) -> None:
        series = detail(world, run).json()["without_new_purchase"]["series"]

        history = [p for p in series if p["actual"] is not None]
        forecast = [p for p in series if p["expected"] is not None]
        assert [p["actual"] for p in history] == [18.0, 22.0, 20.0, 19.0, 21.0, 20.0]
        assert [p["censored"] for p in history] == [False, True, False, False, False, False]
        assert history[-1]["date"] < forecast[0]["date"] == "2026-10-19"
        assert forecast[0]["low"] == 15.0
        assert forecast[0]["projected_stock"] == 10.0

    def test_stockout_zones_cover_past_censored_weeks_and_future_stockouts(
        self,
        world: World,
        run,
    ) -> None:
        zones = detail(world, run).json()["without_new_purchase"]["stockout_zones"]

        monday = DATA_UNTIL + timedelta(days=1) - timedelta(weeks=5)  # the censored history week
        assert zones[0] == {
            "start": monday.isoformat(),
            "end": (monday + timedelta(days=6)).isoformat(),
        }
        assert zones[-1]["end"] == "2027-01-10"  # stocked out until the end of the horizon

    def test_the_suggested_purchase_arrives_at_the_lead_time(self, world: World, run) -> None:
        spec = portfolio()[0]
        body = detail(world, run).json()
        plain, bought = body["without_new_purchase"], body["with_suggested_purchase"]

        assert plain["arrivals"] == []
        assert bought["arrivals"] == [{"date": "2026-10-26", "quantity": 90.0}]
        oracle = expected_weekly(spec, purchase=90.0)
        assert [w["shortfall"]["expected"] for w in bought["weekly"]] == [
            o["shortfall"] for o in oracle
        ]
        assert bought["weekly"][1]["status"] == "arrival"
        assert sum(w["shortfall"]["expected"] for w in bought["weekly"]) < sum(
            w["shortfall"]["expected"] for w in plain["weekly"]
        )

    def test_stock_already_on_order_is_an_arrival_in_both_views(self, world: World) -> None:
        run = add_run(world, [Spec("QF-4001", stock=30.0, on_order=50.0)])

        body = detail(world, run, "QF-4001").json()

        assert body["without_new_purchase"]["arrivals"] == [
            {"date": "2026-10-26", "quantity": 50.0}
        ]
        assert body["with_suggested_purchase"]["arrivals"][0]["quantity"] > 50.0
        assert body["product"]["on_order_quantity"] == 50.0

    def test_unknown_foreign_and_missing(self, world: World, run, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        assert detail(world, run, "NOPE").status_code == 404
        assert (
            world.client.get(
                f"/v1/runs/{other.run}/products/QF-0001", headers=world.headers()
            ).status_code
            == 404
        )
        assert (
            world.client.get(
                f"/v1/runs/{uuid4()}/products/QF-1001", headers=world.headers()
            ).status_code
            == 404
        )
        assert world.client.get(f"/v1/runs/{run.run}/products/QF-1001").status_code == 401

    def test_a_product_of_the_tenant_that_is_not_in_the_run_is_a_404(
        self, world: World, run
    ) -> None:
        add_run(world, [Spec("QF-9100")])

        assert detail(world, run, "QF-9100").status_code == 404


class TestSimulate:
    def test_a_shorter_lead_time_lowers_the_risk(self, world: World, run) -> None:
        baseline = detail(world, run, "QF-1002").json()["product"]

        body = simulate(world, run, {"lead_time_days": 7}).json()

        assert baseline["risk"] == "medium"
        assert body["product"]["risk"] == "optimal"
        assert body["product"]["lead_time_days"] == 7
        assert body["product"]["lead_time_overridden"] is True
        assert body["purchase"]["lead_time_days"] == 7
        assert len(body["projection"]["weekly"]) == HORIZON

    def test_the_target_coverage_changes_the_suggested_quantity(self, world: World, run) -> None:
        base = detail(world, run, "QF-1002").json()["purchase"]["suggested_quantity"]

        more = simulate(world, run, {"target_coverage_weeks": 8}).json()

        assert more["purchase"]["target_coverage_weeks"] == 8
        assert more["purchase"]["suggested_quantity"]["low"] == pytest.approx(
            base["low"] + 4 * 20.0
        )

    def test_with_purchase_adds_the_suggested_low_bound_at_the_lead_time(
        self, world: World, run
    ) -> None:
        suggested = detail(world, run, "QF-1002").json()["purchase"]["suggested_quantity"]["low"]

        body = simulate(world, run, {"with_purchase": True}).json()

        assert body["projection"]["arrivals"] == [{"date": "2026-10-26", "quantity": suggested}]
        assert body["purchase"]["suggested_quantity"]["low"] == suggested  # the pre-purchase advice
        assert body["product"]["risk"] == "optimal"

    def test_an_explicit_quantity_replaces_the_suggestion(self, world: World, run) -> None:
        body = simulate(world, run, {"with_purchase": True, "purchase_quantity": 500}).json()

        assert body["projection"]["arrivals"][0]["quantity"] == 500.0

    def test_a_quantity_without_with_purchase_is_ignored(self, world: World, run) -> None:
        body = simulate(world, run, {"purchase_quantity": 500}).json()

        assert body["projection"]["arrivals"] == []

    def test_an_empty_body_reproduces_the_stored_product(self, world: World, run) -> None:
        stored = detail(world, run, "QF-1002").json()

        body = simulate(world, run, {}).json()

        assert body["product"] == stored["product"]
        assert body["projection"] == stored["without_new_purchase"]

    def test_nothing_is_saved(self, world: World, run) -> None:
        simulate(world, run, {"lead_time_days": 7, "with_purchase": True})

        with psycopg.connect(world.dsn) as admin:
            stored = fetch_row(
                admin,
                "select lead_time_days, risk from public.run_product_metrics "
                "where run_id = %s and product_id = %s",
                [run.run, run.products["QF-1002"]],
            )
            runs = fetch_row(
                admin,
                "select count(*) from public.forecast_runs where conversation_id = %s",
                [run.conversation],
            )
        assert stored == (14, "medium")
        assert runs == (1,)

    @pytest.mark.parametrize(
        "body",
        [
            {"lead_time_days": 0},
            {"lead_time_days": 366},
            {"target_coverage_weeks": -1},
            {"purchase_quantity": -1},
            {"surprise": 1},
        ],
    )
    def test_invalid_bodies_are_a_422(self, world: World, run, body: dict) -> None:
        assert simulate(world, run, body).status_code == 422

    def test_unknown_foreign_and_missing(self, world: World, run, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")
        url = f"/v1/runs/{other.run}/products/QF-0001/simulate"

        assert simulate(world, run, {}, code="NOPE").status_code == 404
        assert world.client.post(url, json={}, headers=world.headers()).status_code == 404
        assert (
            world.client.post(f"/v1/runs/{run.run}/products/QF-1002/simulate", json={}).status_code
            == 401
        )
