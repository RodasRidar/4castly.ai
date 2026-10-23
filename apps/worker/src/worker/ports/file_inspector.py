from __future__ import annotations

from pathlib import Path
from typing import Protocol, runtime_checkable

from worker.domain.documents import Inspection


@runtime_checkable
class FileInspector(Protocol):
    """Opens an uploaded file safely, detects its format and profiles it."""

    def inspect(self, path: Path, file_name: str) -> Inspection: ...
