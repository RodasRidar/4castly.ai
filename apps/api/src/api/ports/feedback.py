from __future__ import annotations

from typing import Protocol
from uuid import UUID


class FeedbackScores(Protocol):
    """Sends a like or dislike to the LLM observability tool as a score on the turn's trace.

    `value` is `up`, `down` or `None` (the vote was cleared). Best effort: callers log failures and
    carry on, because the vote itself is already saved.
    """

    async def score(
        self, trace_id: str, message_id: UUID, user_id: UUID, value: str | None
    ) -> None: ...


class NullScores:
    """Used when Langfuse is not configured."""

    async def score(
        self, trace_id: str, message_id: UUID, user_id: UUID, value: str | None
    ) -> None:
        del trace_id, message_id, user_id, value
