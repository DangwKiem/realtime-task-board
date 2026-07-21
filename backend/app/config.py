from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: Literal[
        "development",
        "test",
        "production",
    ] = "development"

    database_url: str = "sqlite:///./taskboard.db"
    redis_url: str = "redis://localhost:6379/0"

    frontend_origins: str = (
        "http://localhost:3000"
    )

    session_cookie_name: str = (
        "taskboard_session"
    )

    session_idle_ttl_seconds: int = 30 * 60
    session_absolute_ttl_seconds: int = 8 * 60 * 60

    session_secure: bool = False

    websocket_heartbeat_seconds: int = 25
    websocket_max_message_bytes: int = 4096
    websocket_max_connections_per_user: int = 5
    websocket_send_timeout_seconds: float = 3.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.frontend_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()