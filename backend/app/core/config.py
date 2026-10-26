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

    jwt_secret: str = "dev-only-change-me-0123456789abcdef-32bytes"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 1883
    mqtt_topic_prefix: str = "tidewatch/v1"
    mqtt_enabled: bool = False
    mqtt_stale_seconds: int = 30
    mqtt_client_id: str = "tidewatch-backend"

    rule_version: str = "demo-rules-v1"

    # 官方自动监测实时水质（默认关闭；P12 手动拉取；带缓存，避免高频抓取）
    official_auto_enabled: bool = False
    official_auto_url: str = "https://szzdjc.cnemc.cn:8070/GJZ/Ajax/Publish.ashx"
    official_auto_referer: str = (
        "https://szzdjc.cnemc.cn:8070/GJZ/Business/Publish/RealDatas.html"
    )
    official_auto_cache_minutes: int = 30
    # 实测官方每日常态仅发布一条 00:00 快照（2026-10-25 全站 980 行均为 00:00），
    # 因此过期阈值按天计：超过 25 小时未更新视为过期，避免白天全场误报 STALE。
    official_auto_stale_minutes: int = 1500
    official_auto_timeout_seconds: int = 20
    # 连续查询多个断面时的节流，避免触发平台反爬
    official_auto_request_interval_seconds: float = 1.5
    official_auto_retry_delay_seconds: float = 2.0

    upload_dir: str = str(DATA_DIR / "uploads")
    max_upload_mb: int = 8

    # ---- AI 助手（OpenAI 兼容；留空即降级为规则工具模式） ----
    ai_enabled: bool = False
    ai_api_key: str = ""
    ai_base_url: str = ""
    ai_model: str = ""
    ai_timeout_seconds: float = 20.0
    ai_max_tool_rounds: int = 4
    ai_max_output_tokens: int = 800

    @property
    def ai_configured(self) -> bool:
        """是否具备调用大模型的最小配置（key + base_url + model）。"""
        return bool(self.ai_enabled and self.ai_api_key and self.ai_base_url and self.ai_model)

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(DATA_DIR / 'tidewatch.db').as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
