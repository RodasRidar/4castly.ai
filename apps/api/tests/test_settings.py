"""Local overrides: `.env.local` (gitignored) wins over `.env`, so a developer can point the same
checkout at a local Supabase without touching the file that targets the hosted project."""

from __future__ import annotations

from pathlib import Path

import pytest

from api.settings import Settings


def test_env_local_overrides_env_and_the_rest_is_kept(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / ".env").write_text("SUPABASE_URL=https://hosted.example\nENVIRONMENT=dev\n")
    (tmp_path / ".env.local").write_text("SUPABASE_URL=http://127.0.0.1:54321\n")
    monkeypatch.chdir(tmp_path)
    for name in ("SUPABASE_URL", "ENVIRONMENT"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings()

    assert settings.supabase_url == "http://127.0.0.1:54321"
    assert settings.environment == "dev"
