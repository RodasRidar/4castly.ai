from __future__ import annotations

from typing import Protocol
from uuid import UUID


class JobSpawner(Protocol):
    """Starts the worker function for a job (Modal in production).

    The `jobs` row is the source of truth: a failed spawn is recovered by the worker's re-spawn
    sweep (R3), so callers log the failure and carry on.
    """

    async def spawn(self, kind: str, job_id: UUID) -> None: ...
