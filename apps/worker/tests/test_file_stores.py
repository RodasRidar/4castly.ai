"""Downloading uploads: size cap, timeouts and secrets (the service key never reaches logs)."""

from __future__ import annotations

from pathlib import Path

import httpx2
import pytest

from worker.adapters.storage.supabase import FileTooLargeError, SupabaseFileStore


def store(handler, max_bytes: int = 1000) -> SupabaseFileStore:
    client = httpx2.Client(transport=httpx2.MockTransport(handler))
    return SupabaseFileStore(
        "https://abc.supabase.co", "service-key", client=client, max_bytes=max_bytes
    )


def test_downloads_with_the_service_key_from_the_uploads_bucket(tmp_path: Path) -> None:
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(200, content=b"abc")

    path = store(handler).fetch("tenant/upload/kardex.xlsx", tmp_path)

    assert path.read_bytes() == b"abc"
    assert path.name == "kardex.xlsx"
    [request] = seen
    assert (
        str(request.url)
        == "https://abc.supabase.co/storage/v1/object/uploads/tenant/upload/kardex.xlsx"
    )
    assert request.headers["authorization"] == "Bearer service-key"


def test_a_file_over_the_size_cap_is_refused_and_not_left_on_disk(tmp_path: Path) -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, content=b"x" * 5000)

    with pytest.raises(FileTooLargeError):
        store(handler, max_bytes=1000).fetch("t/u/big.xlsx", tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_a_missing_object_is_an_error_without_the_key_in_the_message(tmp_path: Path) -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(404, json={"error": "not found"})

    with pytest.raises(FileNotFoundError) as raised:
        store(handler).fetch("t/u/missing.xlsx", tmp_path)

    assert "service-key" not in str(raised.value)


def test_path_traversal_in_the_storage_path_is_refused(tmp_path: Path) -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, content=b"abc")

    with pytest.raises(ValueError, match="storage path"):
        store(handler).fetch("../../etc/passwd", tmp_path)
