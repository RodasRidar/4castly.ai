from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = "http://127.0.0.1:54321"
    supabase_service_role_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = ""
    """Pooler URL for the `app_api` role (transaction mode). Empty: no database, readiness fails."""
    db_pool_size: int = 2

    environment: str = "local"
    service_version: str = "0.1.0"
    log_json: bool | None = None
    """JSON lines when true; `None` means JSON everywhere except `local`."""
    log_level: str | None = None
    max_body_bytes: int = 1_048_576
    """Largest request body the API reads. Files go straight to storage, so JSON stays small."""

    axiom_domain: str = "api.axiom.co"
    """`api.eu.axiom.co` for the EU region."""
    axiom_token: str = ""
    axiom_dataset: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
