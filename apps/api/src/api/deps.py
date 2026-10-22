from functools import lru_cache

from supabase import Client, create_client

from api.settings import get_settings


@lru_cache
def get_supabase() -> Client:
    """Lazily build the Supabase client so importing the app needs no credentials."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
