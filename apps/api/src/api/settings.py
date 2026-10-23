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


@lru_cache
def get_settings() -> Settings:
    return Settings()
