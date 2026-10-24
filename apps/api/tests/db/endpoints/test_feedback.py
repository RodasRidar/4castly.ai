"""`POST /v1/messages/{id}/feedback`: like or dislike an answer; the vote also becomes a score."""

from __future__ import annotations

from uuid import UUID, uuid4

import psycopg
import pytest

from api.domain.errors import AssistantUnavailableError

from .conftest import World, new_side
from .runs_support import add_run, portfolio


def vote(world: World, message: UUID, value: str | None):
    return world.client.post(
        f"/v1/messages/{message}/feedback", json={"value": value}, headers=world.headers()
    )


def stored(world: World, message: UUID) -> list[tuple]:
    with psycopg.connect(world.dsn) as admin:
        return admin.execute(
            "select user_id, value from public.message_feedback where message_id = %s", [message]
        ).fetchall()


def answered(world: World) -> tuple[UUID, UUID]:
    """A conversation with one finished answer: (conversation, assistant message id)."""
    run = add_run(world, portfolio())
    with world.client.stream(
        "POST",
        f"/v1/conversations/{run.conversation}/messages",
        json={"text": "hola"},
        headers=world.headers(),
    ) as response:
        response.read()
    with psycopg.connect(world.dsn) as admin:
        row = admin.execute(
            "select id from public.messages where conversation_id = %s and role = 'assistant'",
            [run.conversation],
        ).fetchone()
    assert row is not None
    return run.conversation, row[0]


class TestVote:
    def test_a_like_is_stored_and_echoed(self, world: World) -> None:
        _, message = answered(world)

        response = vote(world, message, "up")

        assert response.status_code == 200
        assert response.json() == {"message_id": str(message), "value": "up"}
        assert stored(world, message) == [(world.side.user, "up")]

    def test_changing_the_vote_replaces_it(self, world: World) -> None:
        _, message = answered(world)
        vote(world, message, "up")

        vote(world, message, "down")
        vote(world, message, "down")

        assert stored(world, message) == [(world.side.user, "down")]

    def test_null_clears_the_vote(self, world: World) -> None:
        _, message = answered(world)
        vote(world, message, "up")

        response = vote(world, message, None)

        assert response.json() == {"message_id": str(message), "value": None}
        assert stored(world, message) == []

    def test_clearing_nothing_is_fine(self, world: World) -> None:
        _, message = answered(world)

        assert vote(world, message, None).status_code == 200

    def test_the_history_shows_my_vote(self, world: World) -> None:
        conversation, message = answered(world)
        vote(world, message, "down")

        items = world.client.get(
            f"/v1/conversations/{conversation}/messages", headers=world.headers()
        ).json()["items"]

        assert [m["feedback"] for m in items] == [None, "down"]

    def test_votes_are_audited_without_content(self, world: World) -> None:
        _, message = answered(world)
        vote(world, message, "up")

        with psycopg.connect(world.dsn) as admin:
            row = admin.execute(
                "select action, actor_id, metadata from audit.events where target_id = %s",
                [str(message)],
            ).fetchone()
        assert row == ("assistant.feedback", world.side.user, {"value": "up"})

    @pytest.mark.parametrize("body", [{}, {"value": "sideways"}, {"value": "up", "x": 1}])
    def test_invalid_bodies_are_a_422(self, world: World, body: dict) -> None:
        _, message = answered(world)

        response = world.client.post(
            f"/v1/messages/{message}/feedback", json=body, headers=world.headers()
        )

        assert response.status_code == 422


class TestScores:
    def test_the_vote_is_scored_against_the_turn_trace(self, world: World) -> None:
        _, message = answered(world)
        with psycopg.connect(world.dsn) as admin:
            row = admin.execute(
                "select payload ->> 'trace_id' from public.messages where id = %s", [message]
            ).fetchone()
        assert row is not None
        trace_id = row[0]

        vote(world, message, "up")
        vote(world, message, "down")
        vote(world, message, None)

        assert world.scores.sent == [
            (trace_id, message, world.side.user, "up"),
            (trace_id, message, world.side.user, "down"),
            (trace_id, message, world.side.user, None),
        ]
        assert len(trace_id) == 32

    def test_a_scoring_outage_never_fails_the_vote(self, world: World) -> None:
        _, message = answered(world)
        world.scores.fail = True

        response = vote(world, message, "up")

        assert response.status_code == 200
        assert stored(world, message) == [(world.side.user, "up")]

    def test_answers_without_a_trace_are_not_scored(self, world: World) -> None:
        async def down(history, tools):
            raise AssistantUnavailableError
            yield  # pragma: no cover

        world.agent.script = down
        _, message = answered(world)

        assert vote(world, message, "down").status_code == 200
        assert world.scores.sent == []


class TestAccess:
    def test_user_messages_cannot_be_voted_on(self, world: World) -> None:
        conversation, _ = answered(world)
        with psycopg.connect(world.dsn) as admin:
            row = admin.execute(
                "select id from public.messages where conversation_id = %s and role = 'user'",
                [conversation],
            ).fetchone()
        assert row is not None

        assert vote(world, row[0], "up").status_code == 404

    def test_unknown_and_foreign_messages_are_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        assert vote(world, uuid4(), "up").status_code == 404
        assert vote(world, other.message, "up").status_code == 404

    def test_requires_authentication(self, world: World) -> None:
        response = world.client.post(f"/v1/messages/{uuid4()}/feedback", json={"value": "up"})

        assert response.status_code == 401
