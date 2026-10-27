"""Worker configuration from the environment (Modal secrets in production)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    database_url: str = ""
    """Pooler URL for the `app_worker` role (transaction mode)."""
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_service_role_key: str = ""
    anthropic_api_key: str = ""
    """Empty: the deterministic matcher proposes plans, the digest still works."""
    api_ready_url: str = ""
    """`https://.../health/ready` of the API, for the daily keep-alive."""

    environment: str = "local"
    service_version: str = "0.1.0"
    log_level: str | None = None
    axiom_domain: str = "api.axiom.co"
    axiom_token: str = ""
    axiom_dataset: str = ""

    forecaster: Literal["autoets", "timesfm"] = "autoets"
    """`timesfm` (TimesFM 3.0, non-commercial weights) is accepted only if `environment=local`."""

    max_attempts: int = 3
    stale_after_minutes: int = 10
    queued_after_minutes: int = 2
    db_pool_size: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()
