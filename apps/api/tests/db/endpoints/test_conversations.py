"""`/v1/conversations`: sidebar list, detail, rename/pin/archive, soft delete and history."""

from __future__ import annotations

import base64
from uuid import UUID, uuid4

import psycopg
import pytest

from .conftest import World, add_conversation, add_job, add_message, fetch_row, new_side

BASE = "/v1/conversations"


def set_activity(world: World, conversation: UUID, sql_interval: str) -> None:
    with psycopg.connect(world.dsn, autocommit=True) as admin:
        admin.execute(
            "update public.conversations set last_activity_at = now() - %s::interval where id = %s",
            [sql_interval, conversation],
        )


def listing(world: World, query: str = "") -> dict:
    response = world.client.get(f"{BASE}{query}", headers=world.headers())
    assert response.status_code == 200, response.text
    return response.json()


def ids(page: dict) -> list[str]:
    return [item["id"] for item in page["items"]]


class TestList:
    def test_lists_only_my_tenants_conversations_newest_activity_first(
        self, world: World, pg_dsn: str
    ) -> None:
        old, new = add_conversation(world, title="old"), add_conversation(world, title="new")
        set_activity(world, old, "2 days")
        new_side(pg_dsn, "Other")

        page = listing(world)

        seeded = str(world.side.conversation)  # created when the tenant was seeded
        assert ids(page) == [str(new), seeded, str(old)]
        assert page["next_cursor"] is None

    def test_items_carry_the_file_name_and_the_active_job(self, world: World) -> None:
        conversation = world.side.conversation
        job = add_job(world, conversation, status="running", stage="reading_file")

        item = next(i for i in listing(world)["items"] if i["id"] == str(conversation))

        assert item["file_name"] == "kardex.xlsx"
        assert item["current_job_id"] == str(job)
        assert item["stage"] == "ready"
        assert item["pinned"] is False
        assert item["archived"] is False
        assert item["deleted_at"] is None

    def test_soft_deleted_and_archived_conversations_are_hidden_unless_asked(
        self, world: World
    ) -> None:
        gone, archived = add_conversation(world), add_conversation(world)
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute(
                "update public.conversations set deleted_at = now() where id = %s", [gone]
            )
            admin.execute(
                "update public.conversations set archived_at = now() where id = %s", [archived]
            )

        assert str(gone) not in ids(listing(world))
        assert str(archived) not in ids(listing(world))
        assert str(archived) in ids(listing(world, "?include_archived=true"))
        assert str(gone) not in ids(listing(world, "?include_archived=true"))

    def test_groups(self, world: World) -> None:
        pinned, today, week, older = (add_conversation(world) for _ in range(4))
        set_activity(world, today, "1 minute")
        set_activity(world, week, "3 days")
        set_activity(world, older, "30 days")
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute(
                "update public.conversations set pinned_at = now() where id = %s", [pinned]
            )
        by_id = {i["id"]: i["group"] for i in listing(world)["items"]}

        assert by_id[str(pinned)] == "pinned"
        assert by_id[str(week)] == "this_week"
        assert by_id[str(older)] == "older"
        assert by_id[str(today)] in {"today", "this_week"}  # "today" unless the clock just rolled

    @pytest.mark.parametrize("group", ["pinned", "today", "this_week", "older"])
    def test_filtering_by_group_returns_only_that_group(self, world: World, group: str) -> None:
        for interval in ("1 minute", "3 days", "30 days"):
            conversation = add_conversation(world)
            set_activity(world, conversation, interval)
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute(
                "update public.conversations set pinned_at = now() "
                "where id = (select id from public.conversations where tenant_id = %s limit 1)",
                [world.side.tenant],
            )

        items = listing(world, f"?group={group}")["items"]

        assert {i["group"] for i in items} <= {group}

    def test_search_matches_the_title_ignoring_case(self, world: World) -> None:
        match = add_conversation(world, title="Ventas Octubre")
        add_conversation(world, title="Otro")

        assert ids(listing(world, "?q=octubre")) == [str(match)]

    def test_search_treats_wildcards_literally(self, world: World) -> None:
        add_conversation(world, title="100% real")
        add_conversation(world, title="Other")

        assert len(listing(world, "?q=%25")["items"]) == 1

    def test_pagination_walks_the_whole_list_once(self, world: World) -> None:
        for index in range(5):
            conversation = add_conversation(world, title=f"c{index}")
            set_activity(world, conversation, f"{index} hours")

        first = listing(world, "?limit=4")
        second = listing(world, f"?limit=4&cursor={first['next_cursor']}")

        assert len(first["items"]) == 4
        assert first["next_cursor"] is not None
        assert second["next_cursor"] is None
        assert len(set(ids(first)) | set(ids(second))) == 6  # 5 new + the seeded one

    def test_a_malformed_cursor_is_a_422(self, world: World) -> None:
        response = world.client.get(f"{BASE}?cursor=not-a-cursor", headers=world.headers())

        assert response.status_code == 422

    def test_requires_authentication(self, world: World) -> None:
        assert world.client.get(BASE).status_code == 401


class TestDetail:
    def test_returns_the_conversation_with_its_upload(self, world: World) -> None:
        response = world.client.get(f"{BASE}/{world.side.conversation}", headers=world.headers())

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(world.side.conversation)
        assert body["upload"]["id"] == str(world.side.upload)
        assert body["upload"]["file_name"] == "kardex.xlsx"
        assert body["upload"]["status"] == "readable"

    def test_a_conversation_without_an_upload_has_null(self, world: World) -> None:
        conversation = add_conversation(world)

        body = world.client.get(f"{BASE}/{conversation}", headers=world.headers()).json()

        assert body["upload"] is None

    def test_another_tenants_conversation_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.get(f"{BASE}/{other.conversation}", headers=world.headers())

        assert response.status_code == 404
        assert response.json()["code"] == "not_found"

    def test_a_deleted_conversation_is_a_404(self, world: World) -> None:
        conversation = add_conversation(world)
        world.client.delete(f"{BASE}/{conversation}", headers=world.headers())

        assert (
            world.client.get(f"{BASE}/{conversation}", headers=world.headers()).status_code == 404
        )


class TestUpdate:
    def test_rename_pin_and_archive(self, world: World) -> None:
        conversation = add_conversation(world)
        url, headers = f"{BASE}/{conversation}", world.headers()

        renamed = world.client.patch(url, json={"title": "Nuevo"}, headers=headers).json()
        pinned = world.client.patch(url, json={"pinned": True}, headers=headers).json()
        archived = world.client.patch(url, json={"archived": True}, headers=headers).json()

        assert renamed["title"] == "Nuevo"
        assert pinned["pinned"] is True
        assert pinned["group"] == "pinned"
        assert pinned["title"] == "Nuevo"
        assert archived["archived"] is True
        assert archived["pinned"] is True

    def test_unpin_and_unarchive(self, world: World) -> None:
        conversation = add_conversation(world)
        url, headers = f"{BASE}/{conversation}", world.headers()
        world.client.patch(url, json={"pinned": True, "archived": True}, headers=headers)

        body = world.client.patch(
            url, json={"pinned": False, "archived": False}, headers=headers
        ).json()

        assert (body["pinned"], body["archived"]) == (False, False)

    def test_pinning_twice_keeps_the_first_pin_time(self, world: World) -> None:
        conversation = add_conversation(world)
        url, headers = f"{BASE}/{conversation}", world.headers()
        world.client.patch(url, json={"pinned": True}, headers=headers)
        with psycopg.connect(world.dsn) as admin:
            first = fetch_row(
                admin, "select pinned_at from public.conversations where id = %s", [conversation]
            )

        world.client.patch(url, json={"pinned": True}, headers=headers)

        with psycopg.connect(world.dsn) as admin:
            assert first == fetch_row(
                admin, "select pinned_at from public.conversations where id = %s", [conversation]
            )

    @pytest.mark.parametrize("body", [{}, {"title": ""}, {"title": "x" * 121}, {"id": "x"}])
    def test_invalid_bodies_are_422(self, world: World, body: dict) -> None:
        conversation = add_conversation(world)

        response = world.client.patch(f"{BASE}/{conversation}", json=body, headers=world.headers())

        assert response.status_code == 422

    def test_another_tenants_conversation_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.patch(
            f"{BASE}/{other.conversation}", json={"title": "x"}, headers=world.headers()
        )

        assert response.status_code == 404


class TestDeleteAndRestore:
    def test_delete_is_soft_and_restore_brings_it_back(self, world: World) -> None:
        conversation = add_conversation(world)
        url, headers = f"{BASE}/{conversation}", world.headers()

        deleted = world.client.delete(url, headers=headers)
        gone = str(conversation) not in ids(listing(world))
        restored = world.client.post(f"{url}/restore", headers=headers)

        assert deleted.status_code == 204
        assert deleted.content == b""
        assert gone
        assert restored.status_code == 200
        assert restored.json()["deleted_at"] is None
        assert str(conversation) in ids(listing(world))

    def test_the_row_stays_in_the_database(self, world: World) -> None:
        conversation = add_conversation(world)
        world.client.delete(f"{BASE}/{conversation}", headers=world.headers())

        with psycopg.connect(world.dsn) as admin:
            row = fetch_row(
                admin,
                "select deleted_at is not null from public.conversations where id = %s",
                [conversation],
            )
        assert row == (True,)

    def test_delete_records_a_business_audit_event(self, world: World) -> None:
        conversation = add_conversation(world)
        world.client.delete(
            f"{BASE}/{conversation}", headers={**world.headers(), "X-Request-ID": "req-del"}
        )

        with psycopg.connect(world.dsn) as admin:
            row = fetch_row(
                admin,
                "select action, actor_id, request_id from audit.events where target_id = %s",
                [str(conversation)],
            )
        assert row == ("conversation.deleted", world.side.user, "req-del")

    def test_deleting_twice_is_a_404(self, world: World) -> None:
        conversation = add_conversation(world)
        world.client.delete(f"{BASE}/{conversation}", headers=world.headers())

        assert (
            world.client.delete(f"{BASE}/{conversation}", headers=world.headers()).status_code
            == 404
        )

    def test_restore_only_works_within_thirty_days(self, world: World) -> None:
        conversation = add_conversation(world)
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute(
                "update public.conversations set deleted_at = now() - interval '31 days' "
                "where id = %s",
                [conversation],
            )

        response = world.client.post(f"{BASE}/{conversation}/restore", headers=world.headers())

        assert response.status_code == 404

    def test_restoring_a_live_conversation_is_a_404(self, world: World) -> None:
        conversation = add_conversation(world)

        response = world.client.post(f"{BASE}/{conversation}/restore", headers=world.headers())

        assert response.status_code == 404

    def test_other_tenants_cannot_delete_or_restore(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        assert (
            world.client.delete(f"{BASE}/{other.conversation}", headers=world.headers()).status_code
            == 404
        )
        assert (
            world.client.post(
                f"{BASE}/{other.conversation}/restore", headers=world.headers()
            ).status_code
            == 404
        )


class TestMessages:
    def url(self, conversation: UUID) -> str:
        return f"{BASE}/{conversation}/messages"

    def test_returns_the_history_oldest_first_with_typed_payloads(self, world: World) -> None:
        conversation = add_conversation(world)
        add_message(
            world,
            conversation,
            kind="file",
            text="v.xlsx",
            payload={"kind": "file", "file_name": "v.xlsx", "size_bytes": 10},
        )
        add_message(world, conversation, role="assistant", text="Listo")

        body = world.client.get(self.url(conversation), headers=world.headers()).json()

        assert [m["display_text"] for m in body["items"]] == ["v.xlsx", "Listo"]
        assert body["items"][0]["payload"] == {
            "kind": "file",
            "file_name": "v.xlsx",
            "size_bytes": 10,
        }
        assert body["items"][1]["payload"]["kind"] == "text"
        assert body["items"][1]["role"] == "assistant"
        assert body["items"][1]["status"] == "complete"
        assert body["items"][1]["feedback"] is None
        assert body["next_cursor"] is None

    def test_pages_walk_backwards_from_the_latest_message(self, world: World) -> None:
        conversation = add_conversation(world)
        for index in range(5):
            add_message(world, conversation, text=f"m{index}")

        first = world.client.get(self.url(conversation) + "?limit=2", headers=world.headers())
        cursor = first.json()["next_cursor"]
        second = world.client.get(
            self.url(conversation) + f"?limit=2&cursor={cursor}", headers=world.headers()
        )

        assert [m["display_text"] for m in first.json()["items"]] == ["m3", "m4"]
        assert [m["display_text"] for m in second.json()["items"]] == ["m1", "m2"]

    def test_shows_my_feedback_and_the_product_code_the_question_was_asked_from(
        self, world: World
    ) -> None:
        conversation = world.side.conversation
        message = add_message(
            world, conversation, role="assistant", text="x", product=world.side.product
        )
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute(
                "insert into public.message_feedback (tenant_id, message_id, user_id, value) "
                "values (%s, %s, %s, 'down')",
                [world.side.tenant, message, world.side.user],
            )

        items = world.client.get(self.url(conversation), headers=world.headers()).json()["items"]

        mine = next(m for m in items if m["id"] == str(message))
        assert mine["feedback"] == "down"
        assert mine["context_product_code"] == "QF-0001"

    def test_never_leaks_raw_model_blocks(self, world: World) -> None:
        conversation = add_conversation(world)
        with psycopg.connect(world.dsn, autocommit=True) as admin:
            admin.execute(
                "insert into public.messages (tenant_id, conversation_id, role, kind, blocks, "
                "display_text) values (%s, %s, 'assistant', 'text', '[{\"secret\": 1}]', 'ok')",
                [world.side.tenant, conversation],
            )

        response = world.client.get(self.url(conversation), headers=world.headers())

        assert "secret" not in response.text
        assert "blocks" not in response.text

    def test_another_tenants_conversation_is_a_404(self, world: World, pg_dsn: str) -> None:
        other = new_side(pg_dsn, "Other")

        response = world.client.get(self.url(other.conversation), headers=world.headers())

        assert response.status_code == 404

    def test_a_malformed_cursor_is_a_422(self, world: World) -> None:
        response = world.client.get(
            self.url(world.side.conversation) + "?cursor=" + base64.b64encode(b"x").decode(),
            headers=world.headers(),
        )

        assert response.status_code == 422

    def test_an_unknown_conversation_is_a_404(self, world: World) -> None:
        assert world.client.get(self.url(uuid4()), headers=world.headers()).status_code == 404
