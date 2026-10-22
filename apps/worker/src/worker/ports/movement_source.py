from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from worker.domain.models import Movement


@runtime_checkable
class MovementSource(Protocol):
    """Ingestion port: anything that can yield inventory movements."""

    def read_movements(self) -> Sequence[Movement]: ...
