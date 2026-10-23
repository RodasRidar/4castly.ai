"""`GET /v1/runs/{id}/summary`: KPIs, risk distribution and the aggregate series."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest

from .conftest import World, new_side
from .runs_support import DATA_UNTIL, PARAMS, Spec, add_run, lima_today, portfolio


def summary(world: World, run) -> dict:
    response = world.client.get(f"/v1/runs/{run.run}/summary", headers=world.headers())
    assert response.status_code == 200, response.text
    return response.json()


def test_the_run_reports_its_parameters_and_state(world: World) -> None:
    run = add_run(world, portfolio())

    body = summary(world, run)["run"]

    assert body["id"] == str(run.run)
    assert body["conversation_id"] == str(run.conversation)
    assert body["status"] == "ready"
    assert body["data_until"] == "2026-10-18"
    assert body["parameters"] == {
        "horizon_weeks": 12,
        "granularity": "weekly",
        "lead_time_days": 14,
        "target_coverage_weeks": 4,
        "risk_thresholds": {"critical_margin_weeks": 0.0, "medium_margin_weeks": 2.0},
        "assistant_style": "brief",
    }
    assert body["defaults_used"] == []
    assert body["parameters_pending"] is False
    assert body["created_at"]


def test_defaults_used_and_stock_known_come_from_the_run_params(world: World) -> None:
    params = {"defaults_used": ["lead_time", "stockout_censoring"], "stock_known": False}
    run = add_run(world, portfolio(), params=params)

    body = summary(world, run)

    assert body["run"]["defaults_used"] == ["lead_time", "stockout_censoring"]
    assert body["stock_known"] is False


def test_data_older_than_a_week_is_stale(world: World) -> None:
    old = add_run(world, portfolio(), data_until=lima_today() - timedelta(days=20))
    fresh = add_run(world, portfolio(), data_until=lima_today() - timedelta(days=2))

    assert summary(world, old)["run"]["stale"] is True
    assert summary(world, fresh)["run"]["stale"] is False


def test_saved_but_unapplied_parameters_are_shown_and_flagged(world: World) -> None:
    pending = {
        **{
            k: PARAMS[k]
            for k in (
                "horizon_weeks",
                "granularity",
                "lead_time_days",
                "target_coverage_weeks",
                "risk_thresholds",
                "assistant_style",
            )
        },
        "lead_time_days": 30,
    }
    run = add_run(world, portfolio(), pending=pending)

    body = summary(world, run)["run"]

    assert body["parameters"]["lead_time_days"] == 30
    assert body["parameters_pending"] is True


def test_kpis_and_distributions(world: World) -> None:
    run = add_run(world, portfolio())

    body = summary(world, run)

    assert body["total_products"] == 3
    assert body["risk_distribution"] == {"critical": 1, "medium": 1, "optimal": 1}
    assert body["kpis"]["products_at_risk"] == {
        "q": None,
        "risk": "critical",
        "abc": None,
        "count": 1,
    }
    assert body["kpis"]["reliability"] == {
        "overall": "low",  # three-way tie resolves to the safer claim
        "distribution": {"high": 1, "medium": 1, "low": 1},
    }


def test_average_coverage_counts_no_stockout_as_the_horizon(world: World) -> None:
    run = add_run(world, portfolio())

    coverage = summary(world, run)["kpis"]["average_coverage_weeks"]

    # expected coverage: 30/20 = 1.5, 70/20 = 3.5, no stockout = 12 weeks
    assert coverage["expected"] == pytest.approx((1.5 + 3.5 + 12) / 3, abs=0.01)
    assert coverage["lower"] < coverage["expected"] < coverage["upper"]


def test_series_are_summed_per_unit_of_measure(world: World) -> None:
    run = add_run(world, portfolio())

    series = {s["uom"]: s["points"] for s in summary(world, run)["series_by_uom"]}

    assert list(series) == ["kg", "l"]
    kg = series["kg"]
    history = [p for p in kg if p["actual"] is not None]
    forecast = [p for p in kg if p["expected"] is not None]
    assert len(history) == 6
    assert history[0]["actual"] == 36.0  # two kg products, 18 each
    assert history[0]["date"] < history[-1]["date"] < forecast[0]["date"]
    assert any(p["censored"] for p in history)  # QF-1001 week 2 is censored
    assert len(forecast) == 12
    assert forecast[0]["expected"] == 40.0  # 20 + 20
    assert forecast[0]["low"] == 30.0
    assert forecast[0]["high"] == 56.0
    assert forecast[0]["date"] == "2026-10-19"
    assert len(series["l"]) == 6 + 12


def test_today_is_the_users_calendar_day(world: World) -> None:
    run = add_run(world, portfolio())

    assert summary(world, run)["today"] == lima_today().isoformat()


def test_an_empty_run_has_zero_kpis(world: World) -> None:
    run = add_run(world, [])

    body = summary(world, run)

    assert body["total_products"] == 0
    assert body["risk_distribution"] == {"critical": 0, "medium": 0, "optimal": 0}
    assert body["series_by_uom"] == []
    assert body["kpis"]["average_coverage_weeks"] == {
        "lower": None,
        "expected": None,
        "upper": None,
    }


def test_a_superseded_run_can_still_be_read(world: World) -> None:
    run = add_run(world, portfolio(), status="superseded")

    assert summary(world, run)["run"]["status"] == "superseded"


def test_a_run_still_building_is_a_404(world: World) -> None:
    run = add_run(world, portfolio(), status="building")

    assert (
        world.client.get(f"/v1/runs/{run.run}/summary", headers=world.headers()).status_code == 404
    )


def test_another_tenants_run_is_a_404(world: World, pg_dsn: str) -> None:
    other = new_side(pg_dsn, "Other")

    response = world.client.get(f"/v1/runs/{other.run}/summary", headers=world.headers())

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_an_unknown_run_is_a_404(world: World) -> None:
    assert (
        world.client.get(f"/v1/runs/{uuid4()}/summary", headers=world.headers()).status_code == 404
    )


def test_requires_authentication(world: World) -> None:
    assert world.client.get(f"/v1/runs/{uuid4()}/summary").status_code == 401


def test_a_single_product_run(world: World) -> None:
    run = add_run(world, [Spec("QF-2001", stock=5.0)])

    body = summary(world, run)

    assert body["risk_distribution"]["critical"] == 1
    assert DATA_UNTIL.isoformat() == body["run"]["data_until"]
