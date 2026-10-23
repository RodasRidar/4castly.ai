"""The auth settings the plan fixes (S1-S3) cannot drift unnoticed in supabase/config.toml."""

import re
import tomllib
from pathlib import Path

import pytest

CONFIG = Path(__file__).resolve().parents[3] / "supabase" / "config.toml"


@pytest.fixture(scope="module")
def config() -> dict:
    return tomllib.loads(CONFIG.read_text(encoding="utf-8"))


def test_otp_is_six_digits_valid_ten_minutes_with_a_thirty_second_cooldown(config: dict) -> None:
    email = config["auth"]["email"]

    assert email["otp_length"] == 6
    assert email["otp_expiry"] == 600  # S2
    assert email["max_frequency"] == "30s"  # S-open-1: matches the 30 s resend countdown


def test_tokens_are_short_lived_and_refresh_tokens_rotate(config: dict) -> None:
    auth = config["auth"]

    assert auth["jwt_expiry"] == 3600  # S3
    assert auth["enable_refresh_token_rotation"] is True


def test_only_invited_users_can_be_created(config: dict) -> None:
    hook = config["auth"]["hook"]["before_user_created"]

    assert hook["enabled"] is True
    assert hook["uri"] == "pg-functions://postgres/public/hook_restrict_signup"  # S1


def test_smtp_secrets_come_from_the_environment_never_the_file(config: dict) -> None:
    smtp = config["auth"]["email"]["smtp"]

    assert smtp["host"] == "smtp.resend.com"
    assert smtp["pass"] == "env(RESEND_API_KEY)"  # noqa: S105 - an env() reference, not a secret
    assert smtp["admin_email"].startswith("env(")


def test_no_secret_looking_values_are_committed() -> None:
    text = CONFIG.read_text(encoding="utf-8")

    assert not re.search(r"\bre_[A-Za-z0-9]{16,}", text)  # Resend API key
    assert not re.search(r"\bsb_secret_\w+", text)  # Supabase secret key
    assert "eyJ" not in text  # a JWT (legacy anon / service_role key)


def test_only_the_public_schema_is_exposed_through_the_data_api(config: dict) -> None:
    assert config["api"]["schemas"] == ["public"]
