"""Supabase Storage over its REST API with the service-role key (server side only, S7).

Signed upload URLs let the browser send the file straight to storage, because Vercel caps request
bodies at 4.5 MB. Downloads are signed for 60 seconds (S6).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import httpx

from api.domain.errors import UnavailableError
from api.ports.storage import SignedDownload, SignedUpload, StoredObject

UPLOAD_URL_TTL = timedelta(hours=2)  # fixed by Supabase for signed upload URLs
HEAD_BYTES = 8192
TIMEOUT_SECONDS = 10.0


class SupabaseStorage:
    def __init__(
        self,
        *,
        base_url: str,
        service_key: str,
        bucket: str = "uploads",
        transport: httpx.AsyncBaseTransport | None = None,
        clock=lambda: datetime.now(UTC),  # noqa: ANN001
    ) -> None:
        self._root = f"{base_url.rstrip('/')}/storage/v1"
        self._bucket = bucket
        self._clock = clock
        self._client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    def _object(self, path: str) -> str:
        return f"{self._bucket}/{quote(path, safe='/')}"

    async def _send(self, method: str, url: str, **kwargs) -> httpx.Response:  # noqa: ANN003
        try:
            return await self._client.request(method, url, **kwargs)
        except httpx.HTTPError as error:
            raise UnavailableError from error

    async def create_upload_url(self, path: str, content_type: str) -> SignedUpload:
        response = await self._send("POST", f"{self._root}/object/upload/sign/{self._object(path)}")
        if response.status_code >= 400:  # noqa: PLR2004
            raise UnavailableError
        signed = response.json()["url"]  # "/object/upload/sign/<bucket>/<path>?token=..."
        return SignedUpload(
            url=f"{self._root}{signed}",
            headers={"Content-Type": content_type},
            expires_at=self._clock() + UPLOAD_URL_TTL,
        )

    async def stat(self, path: str) -> StoredObject | None:
        """Size from the info endpoint, then only the first bytes that exist.

        Supabase Storage hangs on a `Range` that ends past the end of the object, so the range is
        clamped to the size (found against a real local Storage, not visible with fakes).
        """
        info = await self._send("GET", f"{self._root}/object/info/{self._object(path)}")
        if info.status_code in (400, 404):
            return None
        if info.status_code >= 400:  # noqa: PLR2004
            raise UnavailableError
        size = int(info.json().get("size") or 0)
        if size == 0:
            return StoredObject(size_bytes=0, head=b"")
        end = min(size, HEAD_BYTES) - 1
        response = await self._send(
            "GET",
            f"{self._root}/object/{self._object(path)}",
            headers={"Range": f"bytes=0-{end}"},
        )
        if response.status_code in (400, 404):
            return None
        if response.status_code >= 400:  # noqa: PLR2004
            raise UnavailableError
        return StoredObject(size_bytes=size, head=response.content[:HEAD_BYTES])

    async def create_download_url(self, path: str, *, ttl_seconds: int = 60) -> SignedDownload:
        response = await self._send(
            "POST",
            f"{self._root}/object/sign/{self._object(path)}",
            json={"expiresIn": ttl_seconds},
        )
        if response.status_code >= 400:  # noqa: PLR2004
            raise UnavailableError
        return SignedDownload(
            url=f"{self._root}{response.json()['signedURL']}",
            expires_at=self._clock() + timedelta(seconds=ttl_seconds),
        )

    async def put(self, path: str, data: bytes, content_type: str) -> None:
        response = await self._send(
            "POST",
            f"{self._root}/object/{self._object(path)}",
            content=data,
            headers={"Content-Type": content_type, "x-upsert": "true"},
        )
        if response.status_code >= 400:  # noqa: PLR2004
            raise UnavailableError

    async def aclose(self) -> None:
        await self._client.aclose()
