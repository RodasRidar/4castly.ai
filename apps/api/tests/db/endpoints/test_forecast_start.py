"""`POST /v1/conversations/{id}/forecast`: answers or skip, then the forecast job starts."""

from __future__ import annotations

from uuid import UUID

import psycopg
import pytest

from .conftest import World, add_conversation, add_plan, fetch_row, new_side


def url(conversation: UUID) -> str:
    return f"/v1/conversations/{conversation}/forecast"


def start(world: World, conversation: UUID, body: dict, key: str | None = None):
    headers = world.headers()
    if key:
        headers["Idempotency-Key"] = key
    return world.client.post(url(conversation), json=body, headers=headers)


def ready_to_forecast(world: World) -> UUID:
    return add_plan(world, stage="confirmed", proposed_by="user", confirmed=True)


def jobs_of(world: World, conversation: UUID) -> list[tuple]:
    with psycopg.connect(world.dsn) as admin:
        return admin.execute(
            "select id, kind, status, params from public.jobs where conversation_id = %s "
            "order by created_at",
            [conversation],
        ).fetchall()


def stage_of(world: World, conversation: UUID) -> str:
    with psycopg.connect(world.dsn) as admin:
        return fetch_row(
            admin, "select stage from public.conversations where id = %s", [conversation]
        )[0]


class TestStartForecast:
    def test_skipping_starts_a_forecast_job_and_spawns_the_worker(self, world: World) -> None:
        conversation = ready_to_forecast(world)

        response = start(world, conversation, {"skip": True})

        assert response.status_code == 202
        body = response.json()
        assert body["conversation_id"] == str(conversation)
        [(job_id, kind, status, params)] = jobs_of(world, conversation)
        assert (str(job_id), kind, status) == (body["job_id"], "forecast", "queued")
        assert params == {"assistant_style": "brief"}
        assert world.spawner.spawned == [("forecast", job_id)]
        assert stage_of(world, conversation) == "calculating"

    def test_the_answers_travel_in_the_job_params(self, world: World) -> None:
        conversation = ready_to_forecast(world)

        start(
            world,
            conversation,
            {"answers": {"lead_time_days": 21, "had_stockouts": "yes"}},
        )

        [(_, _, _, params)] = jobs_of(world, conversation)
        assert params["lead_time_days"] == 21
        assert params["had_stockouts"] == "yes"

    def test_the_users_assistant_style_is_carried_along(self, world: World) -> None:
        world.client.put(
            "/v1/me/preferences",
            json={
                "theme": "dark",
                "locale": "es",
                "time_zone": "America/Lima",
                "assistant_style": "detailed",
            },
            headers=world.headers(),
        )
        conversation = ready_to_forecast(world)

        start(world, conversation, {"skip": True})

        assert jobs_of(world, conversation)[0][3]["assistant_style"] == "detailed"

    def test_the_clarifying_stage_also_accepts_it(self, world: World) -> None:
        conversation = add_plan(world, stage="clarifying", confirmed=True)

        assert start(world, conversation, {"skip": True}).status_code == 202

    @pytest.mark.parametrize(
        "stage", ["queued", "digesting", "awaiting_confirmation", "calculating", "ready", "failed"]
    )
    def test_only_a_confirmed_conversation_can_be_forecast(self, world: World, stage: str) -> None:
        conversation = add_plan(world, stage=stage)

        response = start(world, conversation, {"skip": True})

        assert response.status_code == 409
        assert jobs_of(world, conversation) == []
        assert world.spawner.spawned == []

    def test_a_second_forecast_while_one_runs_is_a_409(self, world: World) -> None:
        conversation = ready_to_forecast(world)
        start(world, conversation, {"skip": True})
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute(
                "update public.conversations set stage = 'confirmed' where id = %s", [conversation]
            )

        response = start(world, conversation, {"skip": True})

        assert response.status_code == 409
        assert len(jobs_of(world, conversation)) == 1

    def test_the_same_idempotency_key_replays_the_first_response(self, world: World) -> None:
        conversation = ready_to_forecast(world)

        first = start(world, conversation, {"skip": True}, key="forecast-key-1")
        second = start(world, conversation, {"skip": True}, key="forecast-key-1")

        assert second.status_code == 202
        assert second.json() == first.json()
        assert len(jobs_of(world, conversation)) == 1
        assert len(world.spawner.spawned) == 1

    def test_the_same_key_with_other_answers_is_a_conflict(self, world: World) -> None:
        conversation = ready_to_forecast(world)
        start(world, conversation, {"skip": True}, key="forecast-key-1")

        response = start(
            world, conversation, {"answers": {"lead_time_days": 10}}, key="forecast-key-1"
        )

        assert response.status_code == 409

    @pytest.mark.parametrize(
        "body",
        [{}, {"skip": False}, {"skip": True, "answers": {"lead_time_days": 5}}, {"answers": {}}],
    )
    def test_the_body_needs_answers_or_skip(self, world: World, body: dict) -> None:
        conversation = ready_to_forecast(world)

        assert start(world, conversation, body).status_code == 422

    def test_a_failed_spawn_still_accepts_the_job(self, world: World) -> None:
        conversation = ready_to_forecast(world)
        world.spawner.fail = True

        assert start(world, conversation, {"skip": True}).status_code == 202
        assert jobs_of(world, conversation)[0][2] == "queued"

    def test_forecasts_are_rate_limited(self, world: World) -> None:
        statuses = []
        for _ in range(31):
            conversation = ready_to_forecast(world)
            statuses.append(start(world, conversation, {"skip": True}).status_code)

        assert statuses[:30] == [202] * 30
        assert statuses[30] == 429

    def test_another_tenants_conversation_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        assert start(world, other.conversation, {"skip": True}).status_code == 404

    def test_an_unknown_conversation_is_a_404(self, world: World) -> None:
        conversation = add_conversation(world)
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute("delete from public.conversations where id = %s", [conversation])

        assert start(world, conversation, {"skip": True}).status_code == 404

    def test_requires_authentication(self, world: World) -> None:
        response = world.client.post(url(world.side.conversation), json={"skip": True})

        assert response.status_code == 401
