"""`/v1/jobs`: state, event stream and cancellation."""

from __future__ import annotations

import json
import threading
import time
from uuid import UUID

import psycopg
import pytest

from .conftest import World, add_conversation, add_job, new_side

DIGEST = ["reading_file", "identifying_columns", "ready"]
FORECAST = ["cleaning_data", "calculating_forecast", "ready"]


def states(body: dict) -> list[tuple[str, str]]:
    return [(s["stage"], s["state"]) for s in body["stages"]]


def get(world: World, job: UUID):
    return world.client.get(f"/v1/jobs/{job}", headers=world.headers())


class TestGetJob:
    def test_a_queued_digest_has_every_stage_pending(self, world: World) -> None:
        conversation = add_conversation(world)
        job = add_job(world, conversation)

        body = get(world, job).json()

        assert body["id"] == str(job)
        assert body["kind"] == "digest"
        assert body["status"] == "queued"
        assert body["conversation_id"] == str(conversation)
        assert body["stage"] is None
        assert states(body) == [(s, "pending") for s in DIGEST]
        assert body["cancel_requested"] is False
        assert body["finished_at"] is None

    def test_a_running_job_marks_earlier_stages_done_and_the_current_one_active(
        self, world: World
    ) -> None:
        job = add_job(
            world,
            add_conversation(world),
            kind="digest",
            status="running",
            stage="identifying_columns",
        )

        body = get(world, job).json()

        assert body["stage"] == "identifying_columns"
        assert states(body) == [
            ("reading_file", "done"),
            ("identifying_columns", "active"),
            ("ready", "pending"),
        ]

    def test_a_forecast_reports_progress_without_a_percentage(self, world: World) -> None:
        job = add_job(
            world,
            add_conversation(world, stage="calculating"),
            kind="forecast",
            status="running",
            stage="calculating_forecast",
            processed=40,
            total=142,
        )

        body = get(world, job).json()

        assert [s["stage"] for s in body["stages"]] == FORECAST
        assert (body["processed"], body["total"]) == (40, 142)
        assert "percent" not in json.dumps(body)

    def test_a_succeeded_job_has_every_stage_done(self, world: World) -> None:
        job = add_job(world, add_conversation(world), status="succeeded", stage="ready")

        body = get(world, job).json()

        assert states(body) == [(s, "done") for s in DIGEST]
        assert body["stage"] is None
        assert body["finished_at"] is not None

    def test_a_failed_job_keeps_the_support_reference(self, world: World) -> None:
        job = add_job(
            world,
            add_conversation(world),
            status="failed",
            stage="identifying_columns",
            error_ref="K7M2QX",
        )

        body = get(world, job).json()

        assert body["status"] == "failed"
        assert body["error_ref"] == "K7M2QX"
        assert states(body)[0] == ("reading_file", "done")
        assert ("identifying_columns", "active") not in states(body)

    def test_another_tenants_job_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        assert get(world, other.job).status_code == 404

    def test_requires_authentication(self, world: World) -> None:
        job = add_job(world, add_conversation(world))

        assert world.client.get(f"/v1/jobs/{job}").status_code == 401


class TestCancelJob:
    def test_cancelling_a_queued_job_ends_it_and_the_conversation_stage(self, world: World) -> None:
        conversation = add_conversation(world, stage="queued")
        job = add_job(world, conversation)

        response = world.client.post(f"/v1/jobs/{job}/cancel", headers=world.headers())

        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"
        with psycopg.connect(world.dsn) as admin:
            stage = admin.execute(
                "select stage from public.conversations where id = %s", [conversation]
            ).fetchone()
        assert stage == ("cancelled",)

    def test_cancelling_a_running_job_asks_it_to_stop_at_the_next_safe_point(
        self, world: World
    ) -> None:
        job = add_job(world, add_conversation(world), status="running", stage="reading_file")

        body = world.client.post(f"/v1/jobs/{job}/cancel", headers=world.headers()).json()

        assert body["status"] == "running"
        assert body["cancel_requested"] is True

    @pytest.mark.parametrize("status", ["succeeded", "failed", "cancelled"])
    def test_a_finished_job_cannot_be_cancelled(self, world: World, status: str) -> None:
        job = add_job(world, add_conversation(world), status=status)

        response = world.client.post(f"/v1/jobs/{job}/cancel", headers=world.headers())

        assert response.status_code == 409

    def test_another_tenants_job_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.post(f"/v1/jobs/{other.job}/cancel", headers=world.headers())

        assert response.status_code == 404


def frames(response) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    name = ""
    for line in response.iter_lines():
        if line.startswith("event: "):
            name = line.removeprefix("event: ")
        elif line.startswith("data: "):
            events.append((name, json.loads(line.removeprefix("data: "))))
    return events


class TestJobEvents:
    @pytest.fixture(autouse=True)
    def fast_polling(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("api.services.jobs.POLL_SECONDS", 0.05)
        monkeypatch.setattr("api.services.jobs.MAX_STREAM_SECONDS", 3.0)

    def test_a_finished_job_sends_one_update_and_closes(self, world: World) -> None:
        job = add_job(world, add_conversation(world), status="succeeded", stage="ready")

        with world.client.stream("GET", f"/v1/jobs/{job}/events", headers=world.headers()) as r:
            assert r.status_code == 200
            assert r.headers["content-type"].startswith("text/event-stream")
            events = frames(r)

        assert [name for name, _ in events] == ["job.update"]
        data = events[0][1]
        assert data["event"] == "job.update"
        assert data["job"]["status"] == "succeeded"

    def test_sends_an_update_on_every_change_until_the_job_ends(self, world: World) -> None:
        job = add_job(world, add_conversation(world), status="running", stage="reading_file")

        def advance() -> None:
            with psycopg.connect(world.dsn, autocommit=True) as admin:
                time.sleep(0.3)
                admin.execute(
                    "update public.jobs set stage = 'identifying_columns' where id = %s", [job]
                )
                time.sleep(0.3)
                admin.execute(
                    "update public.jobs set status = 'succeeded', stage = 'ready', "
                    "finished_at = now() where id = %s",
                    [job],
                )

        worker = threading.Thread(target=advance)
        worker.start()
        with world.client.stream("GET", f"/v1/jobs/{job}/events", headers=world.headers()) as r:
            events = frames(r)
        worker.join()

        statuses = [(d["job"]["status"], d["job"]["stage"]) for _, d in events]
        assert statuses[0] == ("running", "reading_file")
        assert ("running", "identifying_columns") in statuses
        assert statuses[-1] == ("succeeded", None)
        assert len(statuses) == len(set(statuses))  # no duplicate frames while nothing changes

    def test_the_stream_closes_by_itself_so_the_client_reconnects(
        self, world: World, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("api.services.jobs.MAX_STREAM_SECONDS", 0.3)
        job = add_job(world, add_conversation(world), status="running", stage="reading_file")

        started = time.monotonic()
        with world.client.stream("GET", f"/v1/jobs/{job}/events", headers=world.headers()) as r:
            events = frames(r)

        assert time.monotonic() - started < 2
        assert len(events) == 1

    def test_an_unknown_or_foreign_job_is_a_404_before_streaming(
        self, world: World, pg_dsn: str
    ) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.get(f"/v1/jobs/{other.job}/events", headers=world.headers())

        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/problem+json")

    def test_requires_authentication(self, world: World) -> None:
        job = add_job(world, add_conversation(world))

        assert world.client.get(f"/v1/jobs/{job}/events").status_code == 401
