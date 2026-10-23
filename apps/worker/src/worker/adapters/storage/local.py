"""`FileStore` over a local directory: tests and local runs."""

from __future__ import annotations

import shutil
from pathlib import Path


class LocalFileStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def fetch(self, storage_path: str, dest_dir: Path) -> Path:
        source = (self.root / storage_path).resolve()
        if not source.is_relative_to(self.root.resolve()):
            message = "invalid storage path"
            raise ValueError(message)
        target = dest_dir / source.name
        shutil.copy(source, target)
        return target
