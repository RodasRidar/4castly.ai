"""The agent loop against a scripted stand-in for the Anthropic SDK."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from api.adapters.anthropic_agent import AnthropicAgent
from api.assistant.prompt import SYSTEM_PROMPT
from api.domain.errors import AssistantUnavailableError
from api.ports.assistant import (
    TextDelta,
    ToolFinished,
    ToolStarted,
    TurnFinished,
    Usage,
)
from api.services.assistant_tools import TOOL_SPECS


class Block(SimpleNamespace):
    """A content block that dumps like an SDK model."""

    type: str
    text: str

    def __init__(self, **fields: Any) -> None:
        super().__init__(**fields)
        object.__setattr__(self, "_fields", fields)

    def model_dump(self, **_: Any) -> dict[str, Any]:
        return dict(self._fields)


def text_block(text: str) -> Block:
    return Block(type="text", text=text)


def tool_block(call_id: str, name: str, **arguments: Any) -> Block:
    return Block(type="tool_use", id=call_id, name=name, input=arguments)


class Round:
    """One scripted model call: streamed events, then the final message."""

    def __init__(self, content: list[Block], stop: str, usage: tuple[int, int, int] = (10, 5, 0)):
        self.content, self.stop, self.usage = content, stop, usage

    def events(self) -> list[Any]:
        events: list[Any] = []
        for block in self.content:
            if block.type == "text":
                for piece in (block.text[:3], block.text[3:]):
                    if piece:
                        events.append(SimpleNamespace(type="text", text=piece))
            elif block.type == "tool_use":
                events.append(SimpleNamespace(type="content_block_start", content_block=block))
        return events

    def final(self) -> Any:
        i, o, c = self.usage
        return SimpleNamespace(
            content=self.content,
            stop_reason=self.stop,
            usage=SimpleNamespace(input_tokens=i, output_tokens=o, cache_read_input_tokens=c),
        )


class FakeStream:
    def __init__(self, scripted: Round, boom: Exception | None = None) -> None:
        self.scripted, self.boom = scripted, boom

    async def __aenter__(self) -> FakeStream:
        if self.boom:
            raise self.boom
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    def __aiter__(self) -> Any:
        async def generate() -> Any:
            for event in self.scripted.events():
                yield event

        return generate()

    async def get_final_message(self) -> Any:
        return self.scripted.final()


class FakeClient:
    def __init__(self, *rounds: Round, boom: Exception | None = None) -> None:
        self.rounds, self.boom, self.calls = list(rounds), boom, []
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs: Any) -> FakeStream:
        self.calls.append(json.loads(json.dumps(kwargs, default=str)))
        self.calls[-1]["messages"] = json.loads(json.dumps(kwargs["messages"]))
        return FakeStream(self.rounds.pop(0), self.boom)


class FakeTools:
    def __init__(self, result: dict[str, Any] | None = None) -> None:
        self.result, self.executed = result or {"total": {"id": "f7_1", "value": 3}}, []

    async def execute(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.executed.append((name, arguments))
        return self.result


HISTORY = [{"role": "user", "content": [{"type": "text", "text": "hola"}]}]


def agent(client: FakeClient, **kw: Any) -> AnthropicAgent:
    return AnthropicAgent(client, system=SYSTEM_PROMPT, tools=TOOL_SPECS, **kw)


async def collect(
    subject: AnthropicAgent, history: list | None = None, tools: FakeTools | None = None
):
    return [e async for e in subject.run_turn(history or list(HISTORY), tools or FakeTools())]


class TestPlainAnswer:
    async def test_text_is_streamed_then_the_turn_finishes_with_its_messages(self) -> None:
        client = FakeClient(Round([text_block("Hay [[f7_1]] críticos")], "end_turn", (10, 5, 4)))

        events = await collect(agent(client))

        assert [e.text for e in events if isinstance(e, TextDelta)] == ["Hay", " [[f7_1]] críticos"]
        finished = events[-1]
        assert isinstance(finished, TurnFinished)
        assert finished.stop_reason == "end_turn"
        assert finished.usage == Usage(10, 5, 4)
        assert finished.messages == [
            {"role": "assistant", "content": [{"type": "text", "text": "Hay [[f7_1]] críticos"}]}
        ]

    async def test_the_request_is_cached_strict_and_never_forces_a_tool(self) -> None:
        client = FakeClient(Round([text_block("ok")], "end_turn"))

        await collect(agent(client))

        [call] = client.calls
        assert call["model"] == "claude-sonnet-5-5"
        assert call["output_config"] == {"effort": "low"}
        assert call["max_tokens"] == 1500
        assert call["system"] == [
            {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
        ]
        assert [t["name"] for t in call["tools"]] == [t["name"] for t in TOOL_SPECS]
        assert all(t["strict"] for t in call["tools"])
        assert "tool_choice" not in call
        assert call["messages"] == HISTORY

    async def test_the_history_passed_in_is_never_modified(self) -> None:
        history = list(HISTORY)
        client = FakeClient(Round([text_block("ok")], "end_turn"))

        await collect(agent(client), history)

        assert history == HISTORY

    @pytest.mark.parametrize(
        ("stop", "expected"),
        [("max_tokens", "max_tokens"), ("stop_sequence", "end_turn"), ("pause_turn", "end_turn")],
    )
    async def test_stop_reasons_are_normalised(self, stop: str, expected: str) -> None:
        client = FakeClient(Round([text_block("ok")], stop))

        events = await collect(agent(client))

        assert events[-1].stop_reason == expected


class TestTools:
    async def test_a_tool_round_runs_the_tool_and_continues(self) -> None:
        client = FakeClient(
            Round(
                [text_block("Reviso."), tool_block("t1", "find_products", risk="critical")],
                "tool_use",
            ),
            Round([text_block("Son [[f7_1]]")], "end_turn", (20, 8, 10)),
        )
        tools = FakeTools()

        events = await collect(agent(client), tools=tools)

        kinds = [type(e).__name__ for e in events]
        assert kinds == [
            "TextDelta",
            "TextDelta",
            "ToolStarted",
            "ToolFinished",
            "TextDelta",
            "TextDelta",
            "TurnFinished",
        ]
        assert events[2] == ToolStarted("t1", "find_products")
        assert events[3] == ToolFinished("t1")
        assert tools.executed == [("find_products", {"risk": "critical"})]
        finished = events[-1]
        assert finished.usage == Usage(30, 13, 10)  # summed over both model calls
        assert [m["role"] for m in finished.messages] == ["assistant", "user", "assistant"]
        result = finished.messages[1]["content"][0]
        assert result["type"] == "tool_result"
        assert result["tool_use_id"] == "t1"
        assert json.loads(result["content"]) == {"total": {"id": "f7_1", "value": 3}}
        assert "is_error" not in result

    async def test_the_second_call_replays_the_first_answer_and_the_result(self) -> None:
        client = FakeClient(
            Round([tool_block("t1", "get_parameters")], "tool_use"),
            Round([text_block("ok")], "end_turn"),
        )

        await collect(agent(client))

        second = client.calls[1]["messages"]
        assert [m["role"] for m in second] == ["user", "assistant", "user"]
        assert second[1]["content"][0]["type"] == "tool_use"

    async def test_error_results_are_flagged_so_the_model_can_explain_them(self) -> None:
        client = FakeClient(
            Round([tool_block("t1", "get_product_detail", code="NOPE")], "tool_use"),
            Round([text_block("No lo encuentro")], "end_turn"),
        )

        events = await collect(agent(client), tools=FakeTools({"error": "not_found"}))

        assert events[-1].messages[1]["content"][0]["is_error"] is True

    async def test_several_tool_calls_in_one_round_all_get_a_result(self) -> None:
        client = FakeClient(
            Round(
                [tool_block("a", "get_parameters"), tool_block("b", "get_run_summary")], "tool_use"
            ),
            Round([text_block("ok")], "end_turn"),
        )
        tools = FakeTools()

        events = await collect(agent(client), tools=tools)

        results = events[-1].messages[1]["content"]
        assert [r["tool_use_id"] for r in results] == ["a", "b"]
        assert len(tools.executed) == 2

    async def test_a_runaway_loop_is_stopped(self) -> None:
        looping = [Round([tool_block(f"t{i}", "get_parameters")], "tool_use") for i in range(10)]

        with pytest.raises(AssistantUnavailableError):
            await collect(agent(FakeClient(*looping), max_tool_rounds=3))


class TestFailures:
    async def test_a_refusal_ends_the_turn_and_its_content_is_not_kept(self) -> None:
        client = FakeClient(Round([text_block("no puedo")], "refusal"))

        events = await collect(agent(client))

        finished = events[-1]
        assert finished.stop_reason == "refusal"
        assert finished.messages == []

    async def test_provider_errors_become_a_domain_error_without_detail(self) -> None:
        client = FakeClient(Round([], "end_turn"), boom=RuntimeError("sk-ant-secret overloaded"))

        with pytest.raises(AssistantUnavailableError) as raised:
            await collect(agent(client))

        assert "sk-ant" not in str(raised.value)


class TestTracing:
    @pytest.fixture
    def exporter(self) -> InMemorySpanExporter:
        return InMemorySpanExporter()

    def traced(self, client: FakeClient, exporter: InMemorySpanExporter) -> AnthropicAgent:
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        return agent(client, tracer=provider.get_tracer("test"))

    async def test_each_model_call_is_a_genai_span_with_usage_prompt_and_completion(
        self, exporter: InMemorySpanExporter
    ) -> None:
        client = FakeClient(Round([text_block("hola")], "end_turn", (10, 5, 4)))

        await collect(self.traced(client, exporter))

        [span] = exporter.get_finished_spans()
        attributes = span.attributes or {}
        assert attributes["gen_ai.system"] == "anthropic"
        assert attributes["gen_ai.request.model"] == "claude-sonnet-5-5"
        assert attributes["gen_ai.usage.input_tokens"] == 10
        assert attributes["gen_ai.usage.output_tokens"] == 5
        assert attributes["gen_ai.usage.cache_read_tokens"] == 4
        assert json.loads(str(attributes["gen_ai.completion"]))[0]["text"] == "hola"
        assert json.loads(str(attributes["gen_ai.prompt"])) == HISTORY

    async def test_a_tool_turn_produces_one_span_per_model_call(
        self, exporter: InMemorySpanExporter
    ) -> None:
        client = FakeClient(
            Round([tool_block("t1", "get_parameters")], "tool_use"),
            Round([text_block("ok")], "end_turn"),
        )

        await collect(self.traced(client, exporter))

        assert len(exporter.get_finished_spans()) == 2

    async def test_a_failed_call_still_ends_its_span(self, exporter: InMemorySpanExporter) -> None:
        client = FakeClient(Round([], "end_turn"), boom=RuntimeError("down"))

        with pytest.raises(AssistantUnavailableError):
            await collect(self.traced(client, exporter))

        [span] = exporter.get_finished_spans()
        assert span.events  # the exception is recorded
