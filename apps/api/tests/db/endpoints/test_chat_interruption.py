"""A closed or cancelled stream still saves what the user saw, as an interrupted answer."""

from __future__ import annotations

import asyncio

import psycopg
import pytest

from api.auth import Principal, Tx
from api.container import Container
from api.db.context import RequestContext
from api.db.engine import create_engine
from api.ports.assistant import TextDelta
from api.schemas import MessageCreate
from api.services import chat

from .conftest import FakeAgent, World
from .runs_support import add_run, portfolio


@pytest.fixture
async def engine(api_url: str):
    engine = create_engine(api_url)
    yield engine
    await engine.dispose()


async def started(engine, world: World, agent: FakeAgent):
    run = add_run(world, portfolio())
    ctx = RequestContext(world.side.user, {"role": "authenticated"}, request_id="r1")
    who = Principal(ctx, world.side.tenant, "owner", world.side.email)
    container = Container(engine, None, None, None, agent)  # ty: ignore[invalid-argument-type]
    tx = Tx(who, container)
    prepared = await chat.prepare_send(tx, run.conversation, MessageCreate(text="hola"))
    return run, tx, prepared


def answer(world: World, conversation) -> tuple:
    with psycopg.connect(world.dsn) as admin:
        return (
            admin.execute(
                "select status, display_text, blocks from public.messages "
                "where conversation_id = %s and role = 'assistant'",
                [conversation],
            ).fetchone()
            or ()
        )


def stalls(agent: FakeAgent) -> None:
    async def script(history, tools):
        yield TextDelta("Hola mu")
        await asyncio.sleep(30)

    agent.script = script


async def test_closing_the_stream_saves_the_partial_text_as_interrupted(engine, world) -> None:
    stalls(world.agent)
    run, tx, prepared = await started(engine, world, world.agent)
    generator = chat.stream(tx, prepared)

    assert "message.start" in await anext(generator)
    assert "Hola mu" in await anext(generator)
    await generator.aclose()  # the browser pressed Stop

    assert answer(world, run.conversation) == ("interrupted", "Hola mu", [])


async def test_cancelling_the_request_saves_the_partial_text_too(engine, world) -> None:
    stalls(world.agent)
    run, tx, prepared = await started(engine, world, world.agent)

    async def consume() -> None:
        async for _ in chat.stream(tx, prepared):
            pass

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert answer(world, run.conversation) == ("interrupted", "Hola mu", [])


async def test_an_interrupted_answer_is_not_replayed_to_the_model(engine, world) -> None:
    stalls(world.agent)
    run, tx, prepared = await started(engine, world, world.agent)
    generator = chat.stream(tx, prepared)
    await anext(generator)
    await anext(generator)
    await generator.aclose()

    again = await chat.prepare_send(tx, run.conversation, MessageCreate(text="otra"))

    assert [m["role"] for m in again.history] == ["user"]
    assert "Hola mu" not in str(again.history)
