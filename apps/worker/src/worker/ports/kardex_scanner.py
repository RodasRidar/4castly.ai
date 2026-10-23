from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

from worker.domain.documents import DataSummary


@dataclass(frozen=True)
class KardexScan:
    summary: DataSummary
    short_history_products: int


@runtime_checkable
class KardexScanner(Protocol):
    """Summarises a Kardex report for the confirmation screen (products, dates, history)."""

    def scan(self, path: Path) -> KardexScan: ...
