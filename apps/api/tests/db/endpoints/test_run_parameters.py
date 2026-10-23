"""Parameters drawer (`PUT /runs/{id}/parameters`) and `POST /runs/{id}/recalculate`."""

from __future__ import annotations

from uuid import uuid4

import psycopg
import pytest

from .conftest import World, fetch_row, new_side
from .runs_support import add_run, portfolio

APPLIED = {
    "horizon_weeks": 12,
    "granularity": "weekly",
    "lead_time_days": 14,
    "target_coverage_weeks": 4,
    "risk_thresholds": {"critical_margin_weeks": 0.0, "medium_margin_weeks": 2.0},
    "assistant_style": "brief",
}


def save(world: World, run, body: dict):
    return world.client.put(f"/v1/runs/{run.run}/parameters", json=body, headers=world.headers())


def recalc(world: World, run):
    return world.client.post(f"/v1/runs/{run.run}/recalculate", headers=world.headers())


def pending(world: World, run) -> dict | None:
    with psycopg.connect(world.dsn) as admin:
        return fetch_row(
            admin, "select pending_params from public.forecast_runs where id = %s", [run.run]
        )[0]


def jobs(world: World, run) -> list[tuple]:
    with psycopg.connect(world.dsn) as admin:
        return admin.execute(
            "select kind, status, params from public.jobs where conversation_id = %s",
            [run.conversation],
        ).fetchall()


class TestSaveParameters:
    def test_saved_values_are_returned_and_wait_for_the_next_recalculation(
        self, world: World
    ) -> None:
        run = add_run(world, portfolio())
        body = {**APPLIED, "lead_time_days": 30, "horizon_weeks": 24}

        response = save(world, run, body)

        assert response.status_code == 200
        assert response.json() == body
        assert pending(world, run) == body
        summary = world.client.get(f"/v1/runs/{run.run}/summary", headers=world.headers()).json()
        assert summary["run"]["parameters"]["lead_time_days"] == 30
        assert summary["run"]["parameters_pending"] is True

    def test_the_results_are_untouched_until_recalculated(self, world: World) -> None:
        run = add_run(world, portfolio())
        save(world, run, {**APPLIED, "lead_time_days": 30})

        with psycopg.connect(world.dsn) as admin:
            stored = fetch_row(
                admin, "select params from public.forecast_runs where id = %s", [run.run]
            )[0]
            metrics = fetch_row(
                admin,
                "select count(*) from public.run_product_metrics "
                "where run_id = %s and lead_time_days = 14",
                [run.run],
            )[0]
        assert stored["lead_time_days"] == 14
        assert metrics == 3

    def test_saving_the_applied_values_clears_the_pending_ones(self, world: World) -> None:
        run = add_run(world, portfolio())
        save(world, run, {**APPLIED, "lead_time_days": 30})

        save(world, run, APPLIED)

        assert pending(world, run) is None
        summary = world.client.get(f"/v1/runs/{run.run}/summary", headers=world.headers()).json()
        assert summary["run"]["parameters_pending"] is False

    @pytest.mark.parametrize(
        "change",
        [
            {"horizon_weeks": 10},
            {"lead_time_days": 0},
            {"target_coverage_weeks": 53},
            {"risk_thresholds": {"critical_margin_weeks": 5, "medium_margin_weeks": 1}},
            {"assistant_style": "loud"},
            {"granularity": "daily"},
        ],
    )
    def test_invalid_parameters_are_a_422(self, world: World, change: dict) -> None:
        run = add_run(world, portfolio())

        assert save(world, run, {**APPLIED, **change}).status_code == 422
        assert pending(world, run) is None

    def test_monthly_granularity_is_not_supported_by_the_worker_yet(self, world: World) -> None:
        run = add_run(world, portfolio())

        response = save(world, run, {**APPLIED, "granularity": "monthly"})

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.granularityUnsupported"

    def test_a_missing_or_unknown_field_is_a_422(self, world: World) -> None:
        run = add_run(world, portfolio())
        incomplete = {k: v for k, v in APPLIED.items() if k != "lead_time_days"}

        assert save(world, run, incomplete).status_code == 422
        assert save(world, run, {**APPLIED, "extra": 1}).status_code == 422

    def test_a_superseded_run_cannot_be_edited(self, world: World) -> None:
        run = add_run(world, portfolio(), status="superseded")

        assert save(world, run, {**APPLIED, "lead_time_days": 30}).status_code == 409

    def test_another_tenants_run_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.put(
            f"/v1/runs/{other.run}/parameters", json=APPLIED, headers=world.headers()
        )

        assert response.status_code == 404

    def test_unknown_run_and_missing_token(self, world: World) -> None:
        url = f"/v1/runs/{uuid4()}/parameters"

        assert world.client.put(url, json=APPLIED, headers=world.headers()).status_code == 404
        assert world.client.put(url, json=APPLIED).status_code == 401


class TestRecalculate:
    def test_only_the_changed_parameters_travel_in_the_job(self, world: World) -> None:
        run = add_run(world, portfolio())
        save(world, run, {**APPLIED, "lead_time_days": 30})

        response = recalc(world, run)

        assert response.status_code == 202
        body = response.json()
        assert body["conversation_id"] == str(run.conversation)
        [(kind, status, params)] = jobs(world, run)
        assert (kind, status) == ("forecast", "queued")
        assert params == {"recalculate": True, "lead_time_days": 30}
        assert world.spawner.spawned[0][0] == "forecast"
        assert str(world.spawner.spawned[0][1]) == body["job_id"]

    def test_without_saved_changes_it_still_recalculates_with_the_stored_values(
        self, world: World
    ) -> None:
        run = add_run(world, portfolio())

        assert recalc(world, run).status_code == 202
        assert jobs(world, run)[0][2] == {"recalculate": True}

    def test_nested_thresholds_travel_whole(self, world: World) -> None:
        run = add_run(world, portfolio())
        thresholds = {"critical_margin_weeks": 1.0, "medium_margin_weeks": 3.0}
        save(world, run, {**APPLIED, "risk_thresholds": thresholds})

        recalc(world, run)

        assert jobs(world, run)[0][2] == {"recalculate": True, "risk_thresholds": thresholds}

    def test_the_conversation_goes_back_to_calculating_and_an_event_is_recorded(
        self, world: World
    ) -> None:
        run = add_run(world, portfolio())
        recalc(world, run)

        with psycopg.connect(world.dsn) as admin:
            stage = fetch_row(
                admin, "select stage from public.conversations where id = %s", [run.conversation]
            )[0]
            event = fetch_row(
                admin,
                "select action, actor_id from audit.events where target_id = %s",
                [str(run.run)],
            )
        assert stage == "calculating"
        assert event == ("run.recalculated", world.side.user)

    def test_a_second_recalculation_while_one_runs_is_a_409(self, world: World) -> None:
        run = add_run(world, portfolio())
        recalc(world, run)

        assert recalc(world, run).status_code == 409
        assert len(jobs(world, run)) == 1

    def test_a_superseded_run_cannot_be_recalculated(self, world: World) -> None:
        run = add_run(world, portfolio(), status="superseded")

        assert recalc(world, run).status_code == 409
        assert jobs(world, run) == []

    def test_a_failed_spawn_still_accepts_the_job(self, world: World) -> None:
        run = add_run(world, portfolio())
        world.spawner.fail = True

        assert recalc(world, run).status_code == 202
        assert jobs(world, run)[0][1] == "queued"

    def test_another_tenants_run_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.post(f"/v1/runs/{other.run}/recalculate", headers=world.headers())

        assert response.status_code == 404

    def test_requires_authentication(self, world: World) -> None:
        assert world.client.post(f"/v1/runs/{uuid4()}/recalculate").status_code == 401
