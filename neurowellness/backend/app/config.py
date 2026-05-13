import json
from functools import lru_cache
from typing import Any, List, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str          # anon key
    SUPABASE_SERVICE_KEY: str  # service role key (backend only, never expose)
    JWT_SECRET: str            # from Supabase Settings → API → JWT Settings

    # App
    ENVIRONMENT: str = "development"
    API_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    ALLOWED_ORIGIN_REGEX: Optional[str] = None

    # Admin bootstrap
    BOOTSTRAP_SECRET_KEY: str = ""

    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: Any) -> List[str]:
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []

            # Accept either JSON arrays or comma-separated lists from env vars.
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(origin).strip().rstrip("/") for origin in parsed if str(origin).strip()]

            return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]

        if isinstance(value, list):
            return [str(origin).strip().rstrip("/") for origin in value if str(origin).strip()]

        return value

    @field_validator("ALLOWED_ORIGIN_REGEX", mode="before")
    @classmethod
    def parse_allowed_origin_regex(cls, value: Any) -> Optional[str]:
        if isinstance(value, str):
            raw = value.strip()
            return raw or None
        return value

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
