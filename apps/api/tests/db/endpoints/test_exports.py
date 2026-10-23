"""`POST /v1/runs/{id}/exports`: Excel files built from the stored run, formulas escaped (S14)."""

from __future__ import annotations

import io
import zipfile
from uuid import uuid4

import psycopg
import pytest
from openpyxl import load_workbook

from .conftest import World, fetch_row, new_side
from .runs_support import Spec, add_run, portfolio


def export(world: World, run, body: dict):
    return world.client.post(f"/v1/runs/{run.run}/exports", json=body, headers=world.headers())


def sheet_of(world: World, response):
    path = next(p for p in world.storage.objects if response.json()["file_name"] in p)
    return load_workbook(io.BytesIO(world.storage.objects[path])).active


def set_locale(world: World, locale: str) -> None:
    world.client.put(
        "/v1/me/preferences",
        json={
            "theme": "light",
            "locale": locale,
            "time_zone": "America/Lima",
            "assistant_style": "brief",
        },
        headers=world.headers(),
    )


@pytest.fixture
def run(world: World):
    return add_run(world, portfolio())


class TestExport:
    def test_all_products_become_a_signed_download(self, world: World, run) -> None:
        response = export(world, run, {"scope": "all"})

        assert response.status_code == 201
        body = response.json()
        assert body["format"] == "xlsx"
        assert body["file_name"] == "forecast-2026-10-18.xlsx"
        assert body["download_url"].startswith("https://storage.test/download/")
        assert body["download_url"].endswith("ttl=60")  # signed for 60 seconds (S6)
        [path] = world.storage.objects
        assert path.startswith(f"{world.side.tenant}/exports/")
        assert path.endswith("/forecast-2026-10-18.xlsx")
        assert zipfile.is_zipfile(io.BytesIO(world.storage.objects[path]))

    def test_the_sheet_has_one_row_per_product_most_critical_first(self, world: World, run) -> None:
        response = export(world, run, {"scope": "all"})

        sheet = sheet_of(world, response)

        rows = [[c.value for c in row] for row in sheet.iter_rows()]
        assert rows[0][:3] == ["Código", "Producto", "Unidad"]
        assert [r[0] for r in rows[1:]] == ["QF-1001", "QF-1002", "QF-1003"]
        first = dict(zip(rows[0], rows[1], strict=True))
        assert first["Producto"] == "Ácido cítrico"
        assert first["Stock actual"] == 30.0
        assert first["Riesgo"] == "Crítico"
        assert first["Cobertura (semanas)"] == 1.5
        assert first["Cantidad sugerida mín."] == 90.0
        last = dict(zip(rows[0], rows[3], strict=True))
        assert last["Cobertura (semanas)"] == "Sin quiebre en el horizonte"
        assert last["Riesgo"] == "Óptimo"

    def test_headers_follow_the_users_language(self, world: World, run) -> None:
        set_locale(world, "en")

        sheet = sheet_of(world, export(world, run, {"scope": "all"}))

        assert [c.value for c in sheet[1]][:3] == ["Code", "Product", "Unit"]
        assert sheet["H2"].value == "Critical"

    def test_a_selection_exports_only_those_products(self, world: World, run) -> None:
        response = export(world, run, {"scope": "selection", "codes": ["QF-1003", "QF-1001"]})

        sheet = sheet_of(world, response)

        assert [r[0].value for r in sheet.iter_rows(min_row=2)] == ["QF-1001", "QF-1003"]

    def test_a_single_product_names_the_file_after_it(self, world: World, run) -> None:
        response = export(world, run, {"scope": "product", "codes": ["QF-1002"]})

        assert response.json()["file_name"] == "forecast-QF-1002-2026-10-18.xlsx"
        assert sheet_of(world, response).max_row == 2

    def test_unknown_codes_are_a_404_and_nothing_is_stored(self, world: World, run) -> None:
        assert export(world, run, {"scope": "product", "codes": ["NOPE"]}).status_code == 404
        assert export(world, run, {"scope": "selection", "codes": ["NOPE"]}).status_code == 404
        assert world.storage.objects == {}

    def test_a_selection_ignores_codes_that_are_not_in_the_run(self, world: World, run) -> None:
        response = export(world, run, {"scope": "selection", "codes": ["QF-1001", "NOPE"]})

        assert sheet_of(world, response).max_row == 2

    def test_product_names_that_look_like_formulas_are_stored_as_text(self, world: World) -> None:
        evil = '=HYPERLINK("http://evil.example","click")'
        run = add_run(world, [Spec("QF-7001", name=evil), Spec("QF-7002", name="+SUM(A1)")])

        response = export(world, run, {"scope": "all"})

        path = next(iter(world.storage.objects))
        data = world.storage.objects[path]
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            assert b"<f>" not in archive.read("xl/worksheets/sheet1.xml")
        sheet = sheet_of(world, response)
        names = {sheet.cell(row=r, column=2) for r in (2, 3)}
        assert {c.value for c in names} == {evil, "+SUM(A1)"}
        assert {c.data_type for c in names} == {"s"}

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"scope": "all", "codes": ["A"]},
            {"scope": "selection"},
            {"scope": "selection", "codes": []},
            {"scope": "product", "codes": ["A", "B"]},
            {"scope": "all", "format": "csv"},
            {"scope": "everything"},
        ],
    )
    def test_invalid_requests_are_a_422(self, world: World, run, body: dict) -> None:
        assert export(world, run, body).status_code == 422

    def test_exports_are_audited_without_content(self, world: World, run) -> None:
        export(world, run, {"scope": "selection", "codes": ["QF-1001", "QF-1002"]})

        with psycopg.connect(world.dsn) as admin:
            row = fetch_row(
                admin,
                "select action, actor_id, target_type, metadata from audit.events "
                "where target_id = %s",
                [str(run.run)],
            )
        assert row[:3] == ("export.created", world.side.user, "run")
        assert row[3] == {"scope": "selection", "products": 2, "format": "xlsx"}

    def test_exports_are_rate_limited(
        self, world: World, run, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("api.services.limits.EXPORT_LIMIT", (2, 3600))

        statuses = [export(world, run, {"scope": "all"}).status_code for _ in range(3)]

        assert statuses == [201, 201, 429]

    def test_a_superseded_run_can_still_be_exported(self, world: World) -> None:
        run = add_run(world, portfolio(), status="superseded")

        assert export(world, run, {"scope": "all"}).status_code == 201

    def test_another_tenants_run_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.post(
            f"/v1/runs/{other.run}/exports", json={"scope": "all"}, headers=world.headers()
        )

        assert response.status_code == 404
        assert world.storage.objects == {}

    def test_unknown_run_and_missing_token(self, world: World) -> None:
        url = f"/v1/runs/{uuid4()}/exports"

        assert (
            world.client.post(url, json={"scope": "all"}, headers=world.headers()).status_code
            == 404
        )
        assert world.client.post(url, json={"scope": "all"}).status_code == 401
