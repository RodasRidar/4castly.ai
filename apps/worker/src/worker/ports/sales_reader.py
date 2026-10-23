from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

import polars as pl

from worker.domain.documents import NormalizationPlan


@dataclass(frozen=True)
class SalesRead:
    """Rows of the plan's sheet as (sku, sku_name, uom, ds, qty, stock), with what was dropped."""

    frame: pl.DataFrame
    rows_read: int
    rows_dropped: int


@runtime_checkable
class SalesReader(Protocol):
    """Executes a normalization plan on the full file."""

    def read(self, path: Path, file_name: str, plan: NormalizationPlan) -> SalesRead: ...
