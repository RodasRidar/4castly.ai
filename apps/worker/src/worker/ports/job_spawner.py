from __future__ import annotations

from typing import Protocol, runtime_checkable
from uuid import UUID


@runtime_checkable
class JobSpawner(Protocol):
    """Starts the worker function for a job by name (Modal in production)."""

    def spawn(self, kind: str, job_id: UUID) -> None: ...
