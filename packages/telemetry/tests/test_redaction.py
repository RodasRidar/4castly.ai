"""Client data never reaches Axiom: emails, tokens, keys, file contents and chat text are masked."""

import pytest

from telemetry.redaction import REDACTED, redact

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.c2lnbmF0dXJlLXZhbHVl"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("login for ana.torres@example.com failed", "login for [email] failed"),
        (f"token {JWT} rejected", "token [jwt] rejected"),
        ("key sk-ant-api03-AbCdEf0123456789xyz leaked", "key [secret] leaked"),
        ("Authorization: Bearer abc.def-123_456 sent", "Authorization: [secret] sent"),
        ("nothing sensitive here", "nothing sensitive here"),
    ],
)
def test_masks_sensitive_patterns_inside_strings(raw: str, expected: str) -> None:
    assert redact(raw) == expected


@pytest.mark.parametrize(
    "key",
    ["text", "display_text", "content", "prompt", "completion", "file_content", "password",
     "authorization", "token", "secret", "api_key", "email", "Authorization", "TEXT"],
)  # fmt: skip
def test_sensitive_keys_are_replaced_whatever_the_value(key: str) -> None:
    assert redact({key: "anything at all", "route": "/v1/me"}) == {key: REDACTED, "route": "/v1/me"}


def test_redaction_recurses_into_nested_structures() -> None:
    event = {"outer": {"items": [{"text": "hola"}, "mail a@b.co"], "n": 3}, "ok": True}

    assert redact(event) == {
        "outer": {"items": [{"text": REDACTED}, "mail [email]"], "n": 3},
        "ok": True,
    }


def test_non_string_values_pass_through_unchanged() -> None:
    assert redact({"count": 12, "ratio": 0.5, "none": None, "flag": False}) == {
        "count": 12,
        "ratio": 0.5,
        "none": None,
        "flag": False,
    }


def test_input_is_not_mutated() -> None:
    original = {"text": "hola", "nested": {"email": "a@b.co"}}

    redact(original)

    assert original == {"text": "hola", "nested": {"email": "a@b.co"}}
