"""`PUT /v1/products/{code}/overrides`: per-product settings that outlive a run."""

from __future__ import annotations

import psycopg

from .conftest import World, fetch_row, new_side

FULL = {"lead_time_days": 45, "target_coverage_weeks": 8, "on_order_quantity": 120.0}


def put(world: World, body: dict, code: str = "QF-0001"):
    return world.client.put(f"/v1/products/{code}/overrides", json=body, headers=world.headers())


def stored(world: World, tenant=None):
    with psycopg.connect(world.dsn) as admin:
        return admin.execute(
            "select lead_time_days, target_coverage_weeks, on_order_qty "
            "from public.product_overrides where tenant_id = %s",
            [tenant or world.side.tenant],
        ).fetchall()


def test_creates_the_override_and_echoes_it(world: World) -> None:
    response = put(world, FULL)

    assert response.status_code == 200
    assert response.json() == FULL
    assert stored(world) == [(45, 8, 120)]


def test_put_replaces_the_whole_override_and_null_clears_a_value(world: World) -> None:
    put(world, FULL)

    response = put(world, {"lead_time_days": 10, "target_coverage_weeks": None})

    assert response.json() == {
        "lead_time_days": 10,
        "target_coverage_weeks": None,
        "on_order_quantity": None,
    }
    assert stored(world) == [(10, None, None)]


def test_clearing_everything_removes_the_row(world: World) -> None:
    put(world, FULL)

    response = put(world, {})

    assert response.status_code == 200
    assert response.json() == {
        "lead_time_days": None,
        "target_coverage_weeks": None,
        "on_order_quantity": None,
    }
    assert stored(world) == []


def test_clearing_when_there_is_nothing_is_fine(world: World) -> None:
    assert put(world, {}).status_code == 200


def test_changes_are_audited_with_the_actor(world: World) -> None:
    put(world, FULL)

    with psycopg.connect(world.dsn) as admin:
        row = fetch_row(
            admin,
            "select op, actor_id from audit.log_entries "
            "where table_name = 'product_overrides' and tenant_id = %s order by id desc limit 1",
            [world.side.tenant],
        )
    assert row == ("UPDATE", world.side.user)  # the seeded tenant already had an override


def test_another_tenants_override_is_never_touched(world: World, pg_dsn: str) -> None:
    other = new_side(pg_dsn, "Other")  # seeded with lead_time_days = 21 on its own QF-0001

    put(world, FULL)

    assert stored(world, other.tenant) == [(21, None, None)]


def test_an_unknown_product_is_a_404(world: World) -> None:
    assert put(world, FULL, code="NOPE").status_code == 404


def test_invalid_values_are_a_422(world: World) -> None:
    for body in (
        {"lead_time_days": 0},
        {"lead_time_days": 366},
        {"target_coverage_weeks": -1},
        {"on_order_quantity": -5},
        {"surprise": 1},
    ):
        assert put(world, body).status_code == 422


def test_requires_authentication(world: World) -> None:
    assert world.client.put("/v1/products/QF-0001/overrides", json=FULL).status_code == 401
