"""`/v1/me`: authentication, tenant resolution and the profile and preferences endpoints."""

from __future__ import annotations

import time
from uuid import uuid4

import psycopg
import pytest

from api import auth

from .conftest import PROBLEM, World


def test_a_request_without_a_token_is_a_401_problem(world: World) -> None:
    response = world.client.get("/v1/me")

    assert response.status_code == 401
    assert response.headers["content-type"].startswith(PROBLEM)
    assert response.json()["code"] == "unauthenticated"


@pytest.mark.parametrize(
    "authorization",
    ["Bearer not-a-token", "Basic abc", "Bearer "],
    ids=["garbage", "wrong-scheme", "empty"],
)
def test_a_bad_authorization_header_is_a_401(world: World, authorization: str) -> None:
    response = world.client.get("/v1/me", headers={"Authorization": authorization})

    assert response.status_code == 401


def test_an_expired_token_is_a_401(world: World) -> None:
    headers = world.headers(exp=int(time.time()) - 5)

    assert world.client.get("/v1/me", headers=headers).status_code == 401


def test_a_valid_token_of_a_user_without_a_tenant_is_a_403(world: World) -> None:
    response = world.client.get("/v1/me", headers=world.headers(user=uuid4()))

    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_get_me_returns_profile_company_and_the_token_email(world: World) -> None:
    response = world.client.get("/v1/me", headers=world.headers())

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(world.side.user)
    assert body["email"] == world.side.email
    assert body["full_name"].startswith("User T-")
    assert body["job_title"] is None
    assert body["company"]["id"] == str(world.side.tenant)
    assert body["company"]["name"].startswith("T-")


def test_the_tenant_comes_from_membership_never_from_the_request(world: World) -> None:
    headers = {**world.headers(), "X-Tenant-Id": str(uuid4())}

    response = world.client.get("/v1/me?tenant_id=" + str(uuid4()), headers=headers)

    assert response.json()["company"]["id"] == str(world.side.tenant)


def test_identity_is_bound_to_the_logs_once_it_resolves(
    world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[object, object]] = []
    monkeypatch.setattr(auth, "bind_identity", lambda tenant, user: seen.append((tenant, user)))

    world.client.get("/v1/me", headers=world.headers())

    assert seen == [(world.side.tenant, world.side.user)]


def test_a_user_without_a_profile_row_gets_one_named_after_the_email(world: World) -> None:
    with psycopg.connect(world.dsn, autocommit=True) as admin:
        admin.execute("delete from public.profiles where user_id = %s", [world.side.user])

    body = world.client.get("/v1/me", headers=world.headers()).json()

    assert body["full_name"] == world.side.email.split("@")[0]


def test_patch_me_changes_only_the_sent_fields(world: World) -> None:
    headers = world.headers()
    world.client.patch(
        "/v1/me", json={"full_name": "Ana Torres", "job_title": "Buyer"}, headers=headers
    )

    response = world.client.patch("/v1/me", json={"full_name": "Ana T."}, headers=headers)

    assert response.status_code == 200
    assert response.json()["full_name"] == "Ana T."
    assert response.json()["job_title"] == "Buyer"


def test_patch_me_with_null_clears_the_job_title(world: World) -> None:
    headers = world.headers()
    world.client.patch("/v1/me", json={"job_title": "Buyer"}, headers=headers)

    response = world.client.patch("/v1/me", json={"job_title": None}, headers=headers)

    assert response.json()["job_title"] is None


def test_patch_me_rejects_an_empty_body_and_unknown_fields(world: World) -> None:
    headers = world.headers()

    assert world.client.patch("/v1/me", json={}, headers=headers).status_code == 422
    assert world.client.patch("/v1/me", json={"email": "x@y.z"}, headers=headers).status_code == 422


def test_preferences_start_with_the_defaults(world: World) -> None:
    body = world.client.get("/v1/me/preferences", headers=world.headers()).json()

    assert body == {
        "theme": "system",
        "locale": "es",
        "time_zone": "America/Lima",
        "assistant_style": "brief",
    }


def test_put_preferences_replaces_the_whole_object(world: World) -> None:
    headers = world.headers()
    new = {
        "theme": "dark",
        "locale": "en",
        "time_zone": "Europe/Madrid",
        "assistant_style": "detailed",
    }

    put = world.client.put("/v1/me/preferences", json=new, headers=headers)
    get = world.client.get("/v1/me/preferences", headers=headers)

    assert put.status_code == 200
    assert put.json() == new
    assert get.json() == new


def test_put_preferences_rejects_an_unknown_time_zone(world: World) -> None:
    body = {"theme": "dark", "locale": "en", "time_zone": "Mars/Base", "assistant_style": "brief"}

    response = world.client.put("/v1/me/preferences", json=body, headers=world.headers())

    assert response.status_code == 422


def test_changing_my_profile_never_touches_another_tenants_user(world: World, pg_dsn: str) -> None:
    from .conftest import new_side  # noqa: PLC0415

    other = new_side(pg_dsn, "Other")
    world.client.patch("/v1/me", json={"full_name": "Changed"}, headers=world.headers())

    theirs = world.client.get("/v1/me", headers=world.headers(user=other.user, email=other.email))

    assert theirs.json()["full_name"].startswith("User Other-")
