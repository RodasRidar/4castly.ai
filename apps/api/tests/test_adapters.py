"""Adapters against fake transports: the request shapes the real services receive."""

from __future__ import annotations

import io
import sys
import types
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from openpyxl import load_workbook

from api.adapters.modal_spawner import ModalJobSpawner
from api.adapters.supabase_storage import SupabaseStorage
from api.domain.errors import UnavailableError
from api.services.exports import append_row
from api.services.templates import sales_template
from api.services.uploads import detected_type_matches, safe_file_name

NOW = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)


def storage(handler) -> SupabaseStorage:
    return SupabaseStorage(
        base_url="https://x.supabase.co",
        service_key="service-key",
        transport=httpx.MockTransport(handler),
        clock=lambda: NOW,
    )


class TestSupabaseStorage:
    async def test_signs_an_upload_url_with_the_service_key(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                200, json={"url": "/object/upload/sign/uploads/t/u/f.xlsx?token=abc"}
            )

        signed = await storage(handler).create_upload_url("t/u/f.xlsx", "text/csv")

        assert seen[0].url.path == "/storage/v1/object/upload/sign/uploads/t/u/f.xlsx"
        assert seen[0].headers["authorization"] == "Bearer service-key"
        assert signed.url == (
            "https://x.supabase.co/storage/v1/object/upload/sign/uploads/t/u/f.xlsx?token=abc"
        )
        assert signed.headers == {"Content-Type": "text/csv"}
        assert signed.expires_at > NOW

    async def test_stat_asks_for_the_size_then_only_the_bytes_that_exist(self) -> None:
        # Supabase Storage hangs on a Range that ends past the end of the object, so the range is
        # clamped to the size reported by the info endpoint.
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path.endswith("/object/info/uploads/t/u/f.xlsx"):
                return httpx.Response(200, json={"size": 105, "content_type": "text/csv"})
            return httpx.Response(206, content=b"PK\x03\x04rest")

        stored = await storage(handler).stat("t/u/f.xlsx")

        assert stored is not None
        assert stored.size_bytes == 105
        assert stored.head.startswith(b"PK")
        assert seen[1].url.path == "/storage/v1/object/uploads/t/u/f.xlsx"
        assert seen[1].headers["range"] == "bytes=0-104"

    async def test_a_large_object_is_read_only_up_to_the_head_size(self) -> None:
        ranges: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            if "/object/info/" in request.url.path:
                return httpx.Response(200, json={"size": 5_000_000})
            ranges.append(request.headers["range"])
            return httpx.Response(206, content=b"x")

        await storage(handler).stat("t/u/f.xlsx")

        assert ranges == ["bytes=0-8191"]

    async def test_an_empty_object_has_no_head_to_read(self) -> None:
        calls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request.url.path)
            return httpx.Response(200, json={"size": 0})

        stored = await storage(handler).stat("t/u/f.xlsx")

        assert stored is not None
        assert (stored.size_bytes, stored.head) == (0, b"")
        assert len(calls) == 1

    @pytest.mark.parametrize("status", [400, 404])
    async def test_stat_of_a_missing_object_is_none(self, status: int) -> None:
        result = await storage(lambda _r: httpx.Response(status, json={})).stat("t/u/f.xlsx")

        assert result is None

    async def test_download_urls_are_signed_for_sixty_seconds(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.content == b'{"expiresIn":60}'
            return httpx.Response(200, json={"signedURL": "/object/sign/uploads/t/e.xlsx?token=z"})

        signed = await storage(handler).create_download_url("t/e.xlsx")

        assert signed.url.endswith("/storage/v1/object/sign/uploads/t/e.xlsx?token=z")
        assert (signed.expires_at - NOW).total_seconds() == 60

    async def test_an_outage_is_a_503(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("down")

        with pytest.raises(UnavailableError):
            await storage(handler).create_upload_url("t/u/f.xlsx", "text/csv")

    async def test_a_server_error_is_a_503(self) -> None:
        with pytest.raises(UnavailableError):
            await storage(lambda _r: httpx.Response(500)).put("t/e.xlsx", b"x", "text/plain")


class TestModalSpawner:
    async def test_spawns_the_named_function_with_the_job_id(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[tuple[str, str, str | None, str]] = []

        class Spawn:
            def __init__(self, name: str, app: str, env: str | None) -> None:
                self.args = (name, app, env)

            async def aio(self, job_id: str) -> None:
                calls.append((*self.args, job_id))

        class Function:
            @staticmethod
            def from_name(app: str, name: str, *, environment_name: str | None = None):
                return types.SimpleNamespace(spawn=Spawn(name, app, environment_name))

        monkeypatch.setitem(sys.modules, "modal", types.SimpleNamespace(Function=Function))
        job_id = uuid4()

        await ModalJobSpawner(app_name="castly-worker", environment="dev").spawn("digest", job_id)
        await ModalJobSpawner().spawn("forecast", job_id)

        assert calls == [
            ("run_digest", "castly-worker", "dev", str(job_id)),
            ("run_forecast", "castly-worker", None, str(job_id)),
        ]


class TestFileRules:
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("ventas 2026.xlsx", "ventas_2026.xlsx"),
            ("../../etc/pass wd?.xlsx", "pass_wd.xlsx"),
            ("Ñandú.CSV", "Nandu.csv"),
            ("...xlsx", "file.xlsx"),
            ("a..b.xls", "a.b.xls"),
        ],
    )
    def test_safe_file_names(self, name: str, expected: str) -> None:
        assert safe_file_name(name) == expected

    @pytest.mark.parametrize(
        ("name", "head", "ok"),
        [
            ("a.xlsx", b"PK\x03\x04", True),
            ("a.xlsx", b"%PDF-1.7", False),
            ("a.xls", bytes.fromhex("d0cf11e0a1b11ae1"), True),
            ("a.xls", b"PK\x03\x04", True),
            ("a.xls", b"hello", False),
            ("a.csv", b"a,b\n1,2\n", True),
            ("a.csv", b"PK\x03\x04", False),
            ("a.csv", b"\x00\x01", False),
            ("a.xlsm", b"PK\x03\x04", False),
        ],
    )
    def test_type_is_decided_by_content(self, name: str, head: bytes, ok: bool) -> None:
        assert detected_type_matches(name, head) is ok


class TestExcelSafety:
    def test_formula_like_text_is_stored_as_text(self) -> None:
        from openpyxl import Workbook  # noqa: PLC0415

        workbook = Workbook()
        sheet = workbook.active
        values = ['=HYPERLINK("http://evil","x")', "+1", "-1", "@SUM(A1)", "\tx", "normal", 5]
        append_row(sheet, values)
        buffer = io.BytesIO()
        workbook.save(buffer)

        cells = load_workbook(io.BytesIO(buffer.getvalue())).active[1]

        assert [c.data_type for c in cells[:6]] == ["s"] * 6
        assert cells[0].value == values[0]
        assert cells[6].value == 5
        assert b"<f>" not in _sheet_xml(buffer.getvalue())

    def test_the_sales_template_has_the_headers_the_matcher_recognises(self) -> None:
        sheet = load_workbook(io.BytesIO(sales_template())).active

        assert [c.value for c in sheet[1]] == [
            "Fecha",
            "Código",
            "Producto",
            "Cantidad",
            "Stock",
            "Unidad",
        ]
        assert sheet.max_row == 2


def _sheet_xml(data: bytes) -> bytes:
    import zipfile  # noqa: PLC0415

    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return archive.read("xl/worksheets/sheet1.xml")
