from __future__ import annotations

from typing import Protocol, runtime_checkable

from worker.domain.documents import Proposal, SheetProfile


@runtime_checkable
class PlanProposer(Protocol):
    """Proposes a normalization plan from a sheet profile. Adapters: LLM, deterministic matcher."""

    def propose(self, sheet: SheetProfile) -> Proposal: ...
