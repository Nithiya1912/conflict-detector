"""Application configuration loaded from environment variables (.env supported)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Cross-Instruction Conflict Detector"
    environment: str = "development"
    # SQLite by default; set to postgresql+psycopg://user:pass@host/db to migrate.
    database_url: str = f"sqlite:///{(BASE_DIR / 'cicd.db').as_posix()}"

    # Auth. JWT_SECRET MUST be overridden outside local development.
    jwt_secret: str = "dev-only-change-me-please-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 120
    cookie_secure: bool = False
    cookie_name: str = "cicd_session"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Demo mode seeds synthetic data and exposes demo accounts on the login page.
    demo_mode: bool = True

    # LLM provider adapter: "none" (deterministic only) or "anthropic".
    llm_provider: str = "none"
    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-5-5"
    llm_timeout_seconds: float = 60.0

    # Retrieval
    retrieval_top_k: int = 3
    retrieval_min_score: float = 0.08

    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
