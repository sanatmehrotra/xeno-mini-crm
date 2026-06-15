"""
channel-service configuration via pydantic-settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    port: int = 8001

    # URL of the crm-backend webhook endpoint
    crm_callback_url: str = "http://localhost:8000/api/v1/webhooks/channel-receipt"

    # Must match CHANNEL_HMAC_SECRET in crm-backend
    hmac_secret: str = "change-me-32-chars-min-placeholder-x"


settings = Settings()
