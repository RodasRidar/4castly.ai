"""`FileStore` over Supabase Storage with the service role key (private `uploads` bucket)."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import TYPE_CHECKING
from urllib.parse import quote

import httpx2

if TYPE_CHECKING:
    from pathlib import Path

BUCKET = "uploads"
DEFAULT_MAX_BYTES = 200 * 1024 * 1024
TIMEOUT_SECONDS = 60.0
_NOT_FOUND = 404
_ERROR = 400
_CHUNK = 1024 * 1024


class FileTooLargeError(Exception):
    """The object is bigger than the worker accepts (S11)."""


class SupabaseFileStore:
    def __init__(
        self,
        base_url: str,
        service_key: str,
        *,
        client: httpx2.Client | None = None,
        max_bytes: int = DEFAULT_MAX_BYTES,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
        self._client = client or httpx2.Client(timeout=TIMEOUT_SECONDS)
        self._max_bytes = max_bytes

    def fetch(self, storage_path: str, dest_dir: Path) -> Path:
        parts = PurePosixPath(storage_path).parts
        if not parts or storage_path.startswith("/") or ".." in parts:
            message = "invalid storage path"
            raise ValueError(message)
        url = f"{self._base}/storage/v1/object/{BUCKET}/{quote(storage_path, safe='/')}"
        target = dest_dir / parts[-1]
        try:
            with self._client.stream("GET", url, headers=self._headers) as response:
                if response.status_code == _NOT_FOUND:
                    message = "the uploaded object was not found"
                    raise FileNotFoundError(message)
                if response.status_code >= _ERROR:
                    message = f"storage answered {response.status_code}"
                    raise RuntimeError(message)
                written = 0
                with target.open("wb") as out:
                    for chunk in response.iter_bytes(_CHUNK):
                        written += len(chunk)
                        if written > self._max_bytes:
                            message = f"the file is larger than {self._max_bytes} bytes"
                            raise FileTooLargeError(message)
                        out.write(chunk)
        except BaseException:
            target.unlink(missing_ok=True)
            raise
        return target
