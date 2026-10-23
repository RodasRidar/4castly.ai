"""`GET /v1/templates/sales.xlsx`."""

from __future__ import annotations

from .conftest import World

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def test_downloads_a_workbook(world: World) -> None:
    response = world.client.get("/v1/templates/sales.xlsx", headers=world.headers())

    assert response.status_code == 200
    assert response.headers["content-type"] == XLSX
    assert "sales-template.xlsx" in response.headers["content-disposition"]
    assert response.content.startswith(b"PK")


def test_requires_authentication(world: World) -> None:
    assert world.client.get("/v1/templates/sales.xlsx").status_code == 401
