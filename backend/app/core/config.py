"""应用配置：环境变量 + .env，集中管理，不硬编码密钥。"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "backend"
DATA_DIR = REPO_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 留空时使用仓库根 data/tidewatch.db（绝对路径，避免随启动目录漂移）
    database_url: str = ""

    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 1883
    mqtt_topic_prefix: str = "tidewatch/v1"
    mqtt_client_id: str = "tidewatch-backend"
    mqtt_enabled: bool = False

    rule_version: str = "demo-rules-v1"

    upload_dir: str = str(DATA_DIR / "uploads")
    max_upload_mb: int = 8

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(DATA_DIR / 'tidewatch.db').as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
