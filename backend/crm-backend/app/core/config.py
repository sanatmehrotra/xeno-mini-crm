"""
Application configuration via pydantic-settings.
All env vars are read at startup from the process environment (set in Railway / Render dashboard)
or from a local .env file for development.

Production note:
  - Never commit .env — it contains secrets.
  - Set all these vars in Railway's "Variables" tab.
  - FRONTEND_ORIGINS accepts a comma-separated list so you can allow both
    your Render URL and localhost during testing:
      FRONTEND_ORIGINS=https://brewbharat.onrender.com,http://localhost:3000
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database — Railway provides DATABASE_URL automatically when you add a Postgres plugin
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/xeno_crm"

    # Redis — Railway provides REDIS_URL automatically when you add a Redis plugin
    redis_url: str = "redis://localhost:6379/0"

    # Channel service
    channel_service_url: str = "http://localhost:8001"
    channel_hmac_secret: str = "change-me-32-chars-min-placeholder"

    # JWT auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    # Admin credentials (no users table — single env-based admin)
    admin_email: str = "admin@xeno.local"
    admin_password_hash: str = ""  # bcrypt hash; generate via scripts/hash_password.py

    # OpenRouter AI
    openrouter_api_key: str = ""
    ai_model_fast: str = "google/gemini-flash-1.5"
    ai_model_smart: str = "anthropic/claude-3.5-sonnet"

    # Attribution
    attribution_window_hours: int = 72

    # CORS — comma-separated list of allowed origins
    # e.g. FRONTEND_ORIGINS=https://your-app.onrender.com,http://localhost:3000
    frontend_origins: str = "http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        """Parse comma-separated FRONTEND_ORIGINS into a list."""
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]


# Single instance imported everywhere
settings = Settings()
