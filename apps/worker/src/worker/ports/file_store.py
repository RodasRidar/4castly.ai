from __future__ import annotations

from pathlib import Path
from typing import Protocol, runtime_checkable


@runtime_checkable
class FileStore(Protocol):
    """Where uploads live. `fetch` copies one object into `dest_dir` and returns its local path."""

    def fetch(self, storage_path: str, dest_dir: Path) -> Path: ...
