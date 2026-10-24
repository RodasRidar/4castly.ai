"""The assistant agent port: one turn of a tool-using conversation, streamed as events."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

Message = dict[str, Any]
"""One API message (`{"role", "content"}`) exactly as the model provider sees it."""


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class ToolStarted:
    call_id: str
    tool: str


@dataclass(frozen=True)
class ToolFinished:
    call_id: str


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0

    def __add__(self, other: Usage) -> Usage:
        return Usage(
            self.input_tokens + other.input_tokens,
            self.output_tokens + other.output_tokens,
            self.cache_read_tokens + other.cache_read_tokens,
        )


@dataclass(frozen=True)
class TurnFinished:
    stop_reason: str
    """`end_turn`, `max_tokens` or `refusal`."""
    usage: Usage
    messages: list[Message]
    """The API messages this turn added, in order (assistant, tool results, assistant...). Stored
    as they are and replayed unchanged. A refused answer is not part of them."""


AgentEvent = TextDelta | ToolStarted | ToolFinished | TurnFinished


class ToolRunner(Protocol):
    async def execute(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]: ...


class AssistantAgent(Protocol):
    def run_turn(self, history: list[Message], tools: ToolRunner) -> AsyncIterator[AgentEvent]:
        """`history` ends with the user's message and is never modified. Raises
        `AssistantUnavailableError` when the model cannot answer."""
        ...
