"""The assistant agent over the Anthropic SDK: a ~100-line tool loop we own (plan 7c).

Streaming events are forwarded as they arrive; tool calls are executed between model rounds; the raw
API messages of the turn are returned so they can be stored and replayed unchanged. Each model call
is an OpenTelemetry span with GenAI attributes, including prompt and completion: those go to
Langfuse, and the Axiom exporter drops them (S9).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

import structlog
from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.trace import Span, Tracer

from api.domain.errors import AssistantUnavailableError
from api.ports.assistant import (
    AgentEvent,
    Message,
    TextDelta,
    ToolFinished,
    ToolRunner,
    ToolStarted,
    TurnFinished,
    Usage,
)

MODEL = "claude-sonnet-5-5"
EFFORT = "low"
MAX_TOKENS = 1500
MAX_TOOL_ROUNDS = 6
TIMEOUT_SECONDS = 60.0
_STOP_REASONS = {"end_turn": "end_turn", "max_tokens": "max_tokens", "refusal": "refusal"}


def _usage(raw: Any) -> Usage:
    return Usage(
        input_tokens=getattr(raw, "input_tokens", 0) or 0,
        output_tokens=getattr(raw, "output_tokens", 0) or 0,
        cache_read_tokens=getattr(raw, "cache_read_input_tokens", 0) or 0,
    )


def _dump(blocks: Sequence[Any]) -> list[dict[str, Any]]:
    """Content blocks as plain dicts, otherwise untouched (thinking signatures included)."""
    return [block.model_dump(mode="json", exclude_none=True) for block in blocks]


class AnthropicAgent:
    def __init__(  # noqa: PLR0913
        self,
        client: Any,
        *,
        system: str,
        tools: Sequence[dict[str, Any]],
        model: str = MODEL,
        effort: str = EFFORT,
        max_tokens: int = MAX_TOKENS,
        max_tool_rounds: int = MAX_TOOL_ROUNDS,
        tracer: Tracer | None = None,
    ) -> None:
        self._client = client
        self._system = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        self._tools = list(tools)
        self._model, self._effort, self._max_tokens = model, effort, max_tokens
        self._max_rounds = max_tool_rounds
        self._tracer = tracer or trace.get_tracer("api.assistant")

    async def run_turn(
        self, history: list[Message], tools: ToolRunner
    ) -> AsyncIterator[AgentEvent]:
        messages = list(history)
        produced: list[Message] = []
        usage = Usage()
        parent = otel_context.get_current()
        for _ in range(self._max_rounds):
            final = None
            span = self._tracer.start_span(f"chat {self._model}", context=parent)
            try:
                async with self._client.messages.stream(
                    model=self._model,
                    max_tokens=self._max_tokens,
                    system=self._system,
                    tools=self._tools,
                    messages=messages,
                    output_config={"effort": self._effort},
                    timeout=TIMEOUT_SECONDS,
                ) as stream:
                    async for event in stream:
                        if event.type == "text":
                            yield TextDelta(event.text)
                        elif (
                            event.type == "content_block_start"
                            and event.content_block.type == "tool_use"
                        ):
                            yield ToolStarted(event.content_block.id, event.content_block.name)
                    final = await stream.get_final_message()
            except AssistantUnavailableError:
                raise
            except Exception as error:
                span.record_exception(error)
                structlog.get_logger().warning(
                    "assistant.model_failed", error_type=type(error).__name__
                )
                raise AssistantUnavailableError from error
            finally:
                self._finish_span(span, messages, final)
            round_usage = _usage(final.usage)
            usage += round_usage
            reason = _STOP_REASONS.get(final.stop_reason, "end_turn")
            if final.stop_reason == "refusal":
                yield TurnFinished("refusal", usage, produced)
                return
            assistant: Message = {"role": "assistant", "content": _dump(final.content)}
            produced.append(assistant)
            messages.append(assistant)
            if final.stop_reason != "tool_use":
                yield TurnFinished(reason, usage, produced)
                return
            results = []
            for block in final.content:
                if block.type != "tool_use":
                    continue
                result = await tools.execute(block.name, dict(block.input))
                yield ToolFinished(block.id)
                item: dict[str, Any] = {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }
                if "error" in result:
                    item["is_error"] = True
                results.append(item)
            tool_message: Message = {"role": "user", "content": results}
            produced.append(tool_message)
            messages.append(tool_message)
        structlog.get_logger().warning("assistant.too_many_tool_rounds")
        raise AssistantUnavailableError

    def _finish_span(self, span: Span, messages: list[Message], final: Any) -> None:
        span.set_attribute("gen_ai.system", "anthropic")
        span.set_attribute("gen_ai.request.model", self._model)
        if final is not None:
            usage = _usage(final.usage)
            span.set_attribute("gen_ai.usage.input_tokens", usage.input_tokens)
            span.set_attribute("gen_ai.usage.output_tokens", usage.output_tokens)
            span.set_attribute("gen_ai.usage.cache_read_tokens", usage.cache_read_tokens)
            span.set_attribute("gen_ai.response.finish_reasons", [str(final.stop_reason)])
            span.set_attribute("gen_ai.prompt", json.dumps(messages, ensure_ascii=False))
            span.set_attribute(
                "gen_ai.completion", json.dumps(_dump(final.content), ensure_ascii=False)
            )
        span.end()


class UnconfiguredAgent:
    """Used when no API key is set: the chat answers 503 instead of crashing at startup."""

    async def run_turn(
        self, history: list[Message], tools: ToolRunner
    ) -> AsyncIterator[AgentEvent]:
        del history, tools
        raise AssistantUnavailableError
        yield  # pragma: no cover - makes this an async generator


def build_agent(
    api_key: str, *, system: str, tools: Sequence[dict[str, Any]], tracer: Tracer | None = None
) -> Any:
    if not api_key:
        return UnconfiguredAgent()
    import anthropic  # noqa: PLC0415 - heavy import, only when the assistant is configured

    return AnthropicAgent(
        anthropic.AsyncAnthropic(api_key=api_key, max_retries=1),
        system=system,
        tools=tools,
        tracer=tracer,
    )
