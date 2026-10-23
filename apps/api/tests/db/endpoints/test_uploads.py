"""`/v1/uploads`: signed direct-to-storage upload, then completion that starts the digest."""

from __future__ import annotations

import io
from uuid import UUID

import psycopg
import pytest
from openpyxl import Workbook

from .conftest import World, fetch_row

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
BODY = {"file_name": "ventas 2026.xlsx", "size_bytes": 2048, "content_type": XLSX}


def xlsx_bytes() -> bytes:
    buffer = io.BytesIO()
    Workbook().save(buffer)
    return buffer.getvalue()


def create(world: World, **overrides: object) -> dict:
    response = world.client.post("/v1/uploads", json={**BODY, **overrides}, headers=world.headers())
    assert response.status_code == 201, response.text
    return response.json()


def storage_path(world: World, upload_id: str) -> str:
    return world.storage.upload_requests[-1][0]


class TestCreateUpload:
    def test_returns_a_signed_url_under_the_tenant_folder(self, world: World) -> None:
        ticket = create(world)

        path, content_type = world.storage.upload_requests[-1]
        upload_id = ticket["upload_id"]
        assert path.startswith(f"{world.side.tenant}/{upload_id}/")
        assert content_type == XLSX
        assert ticket["upload_url"].startswith("https://storage.test/upload/")
        assert ticket["method"] == "PUT"
        assert ticket["headers"] == {"Content-Type": XLSX}

    def test_the_file_name_never_reaches_the_storage_path_unsanitised(self, world: World) -> None:
        create(world, file_name="../../etc/pass wd?.xlsx")

        path = world.storage.upload_requests[-1][0]
        name = path.split("/", 2)[2]
        assert "/" not in name
        assert ".." not in name
        assert name.endswith(".xlsx")

    def test_records_a_pending_upload_owned_by_the_caller(self, world: World) -> None:
        ticket = create(world)

        with psycopg.connect(world.dsn) as admin:
            row = admin.execute(
                "select tenant_id, created_by, status, file_name, conversation_id "
                "from public.uploads where id = %s",
                [ticket["upload_id"]],
            ).fetchone()
        assert row == (world.side.tenant, world.side.user, "pending", "ventas 2026.xlsx", None)

    def test_a_file_over_the_size_limit_is_refused_before_anything_is_stored(
        self, world: World
    ) -> None:
        response = world.client.post(
            "/v1/uploads",
            json={**BODY, "size_bytes": 10**10},
            headers=world.headers(),
        )

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.fileTooLarge"
        assert world.storage.upload_requests == []

    @pytest.mark.parametrize(
        "overrides",
        [{"file_name": "macro.xlsm"}, {"content_type": "application/pdf"}, {"size_bytes": 0}],
    )
    def test_unsupported_files_are_a_422(self, world: World, overrides: dict) -> None:
        response = world.client.post(
            "/v1/uploads", json={**BODY, **overrides}, headers=world.headers()
        )

        assert response.status_code == 422

    def test_requires_authentication(self, world: World) -> None:
        assert world.client.post("/v1/uploads", json=BODY).status_code == 401

    def test_uploads_are_rate_limited(self, world: World) -> None:
        statuses = [
            world.client.post("/v1/uploads", json=BODY, headers=world.headers()).status_code
            for _ in range(31)
        ]

        assert statuses[:30] == [201] * 30
        assert statuses[30] == 429


class TestCompleteUpload:
    def put_object(self, world: World, ticket: dict, data: bytes) -> None:
        world.storage.objects[world.storage.upload_requests[-1][0]] = data

    def complete(self, world: World, upload_id: str, key: str | None = None):
        headers = world.headers()
        if key:
            headers["Idempotency-Key"] = key
        return world.client.post(f"/v1/uploads/{upload_id}/complete", headers=headers)

    def test_creates_the_conversation_and_digest_job_and_spawns_the_worker(
        self, world: World
    ) -> None:
        ticket = create(world)
        self.put_object(world, ticket, xlsx_bytes())

        response = self.complete(world, ticket["upload_id"])

        assert response.status_code == 201
        body = response.json()
        assert world.spawner.spawned == [("digest", UUID(body["job_id"]))]
        with psycopg.connect(world.dsn) as admin:
            job = admin.execute(
                "select kind, status, conversation_id from public.jobs where id = %s",
                [body["job_id"]],
            ).fetchone()
            conversation = admin.execute(
                "select stage, title, created_by from public.conversations where id = %s",
                [body["conversation_id"]],
            ).fetchone()
            upload = fetch_row(
                admin,
                "select status, conversation_id, size_bytes from public.uploads where id = %s",
                [ticket["upload_id"]],
            )
        assert job == ("digest", "queued", UUID(body["conversation_id"]))
        assert conversation == ("queued", "ventas 2026", world.side.user)
        assert upload[0:2] == ("uploaded", UUID(body["conversation_id"]))
        assert upload[2] == len(xlsx_bytes())

    def test_a_missing_object_is_a_409_and_nothing_is_created(self, world: World) -> None:
        ticket = create(world)

        response = self.complete(world, ticket["upload_id"])

        assert response.status_code == 409
        assert world.spawner.spawned == []
        with psycopg.connect(world.dsn) as admin:
            (count,) = fetch_row(
                admin,
                "select count(*) from public.jobs where tenant_id = %s and kind = 'digest'",
                [world.side.tenant],
            )
        assert count == 0

    @pytest.mark.parametrize(
        ("data", "reason"),
        [
            (b"%PDF-1.7 not a spreadsheet", "unsupported_format"),
            (b"\x00\x01\x02binary garbage", "unsupported_format"),
        ],
    )
    def test_the_type_is_checked_by_content_not_by_name(
        self, world: World, data: bytes, reason: str
    ) -> None:
        ticket = create(world)
        self.put_object(world, ticket, data)

        response = self.complete(world, ticket["upload_id"])

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.fileTypeMismatch"
        assert world.spawner.spawned == []
        with psycopg.connect(world.dsn) as admin:
            row = admin.execute(
                "select status, error_code from public.uploads where id = %s",
                [ticket["upload_id"]],
            ).fetchone()
        assert row == ("failed", reason)

    def test_csv_text_is_accepted(self, world: World) -> None:
        ticket = create(world, file_name="ventas.csv", content_type="text/csv", size_bytes=30)
        self.put_object(world, ticket, b"fecha,codigo,cantidad\n2026-01-01,A,1\n")

        assert self.complete(world, ticket["upload_id"]).status_code == 201

    def test_an_object_bigger_than_the_limit_is_refused_even_if_the_ticket_was_small(
        self, world: World, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("api.services.uploads.MAX_UPLOAD_BYTES", 100)
        ticket = create(world, size_bytes=50)
        self.put_object(world, ticket, xlsx_bytes())

        response = self.complete(world, ticket["upload_id"])

        assert response.status_code == 422
        assert response.json()["message_key"] == "errors.fileTooLarge"

    def test_completing_twice_without_a_key_is_a_409(self, world: World) -> None:
        ticket = create(world)
        self.put_object(world, ticket, xlsx_bytes())
        self.complete(world, ticket["upload_id"])

        assert self.complete(world, ticket["upload_id"]).status_code == 409
        assert len(world.spawner.spawned) == 1

    def test_the_same_idempotency_key_replays_the_first_response(self, world: World) -> None:
        ticket = create(world)
        self.put_object(world, ticket, xlsx_bytes())

        first = self.complete(world, ticket["upload_id"], key="complete-key-1")
        second = self.complete(world, ticket["upload_id"], key="complete-key-1")

        assert second.status_code == 201
        assert second.json() == first.json()
        assert len(world.spawner.spawned) == 1

    def test_the_same_key_for_another_upload_is_a_conflict(self, world: World) -> None:
        one, two = create(world), create(world)
        self.put_object(world, two, xlsx_bytes())
        world.storage.objects[
            next(p for p, _ in world.storage.upload_requests if one["upload_id"] in p)
        ] = xlsx_bytes()
        self.complete(world, one["upload_id"], key="complete-key-1")

        response = self.complete(world, two["upload_id"], key="complete-key-1")

        assert response.status_code == 409

    def test_a_failed_spawn_still_succeeds_because_the_job_row_is_the_truth(
        self, world: World
    ) -> None:
        ticket = create(world)
        self.put_object(world, ticket, xlsx_bytes())
        world.spawner.fail = True

        response = self.complete(world, ticket["upload_id"])

        assert response.status_code == 201
        with psycopg.connect(world.dsn) as admin:
            (status,) = fetch_row(
                admin,
                "select status from public.jobs where id = %s",
                [response.json()["job_id"]],
            )
        assert status == "queued"

    def test_another_tenants_upload_is_a_404(self, world: World, pg_dsn: str) -> None:
        from .conftest import new_side  # noqa: PLC0415

        other = new_side(pg_dsn, "Other")

        response = world.client.post(
            f"/v1/uploads/{other.upload}/complete", headers=world.headers()
        )

        assert response.status_code == 404

    def test_an_unknown_upload_is_a_404(self, world: World) -> None:
        response = world.client.post(
            "/v1/uploads/00000000-0000-0000-0000-00000000dead/complete", headers=world.headers()
        )

        assert response.status_code == 404

    def test_the_initial_file_message_is_recorded_in_the_conversation(self, world: World) -> None:
        ticket = create(world)
        self.put_object(world, ticket, xlsx_bytes())
        body = self.complete(world, ticket["upload_id"]).json()

        with psycopg.connect(world.dsn) as admin:
            row = admin.execute(
                "select role, kind, payload ->> 'file_name' from public.messages "
                "where conversation_id = %s",
                [body["conversation_id"]],
            ).fetchone()
        assert row == ("user", "file", "ventas 2026.xlsx")
