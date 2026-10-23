from __future__ import annotations

from typing import Protocol, runtime_checkable

from worker.domain.jobs import JobClaim


@runtime_checkable
class ConversationStager(Protocol):
    """Moves a conversation to another stage (the UI is driven by it)."""

    def set_conversation_stage(self, claim: JobClaim, stage: str) -> None: ...
