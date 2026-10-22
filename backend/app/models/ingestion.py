"""数据接入支撑表：消息幂等去重、坏消息死信。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now


class ProcessedMessage(Base):
    """已处理 MQTT 消息：一条消息只生效一次（重复投递幂等）。"""

    __tablename__ = "processed_messages"

    message_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    reach_id: Mapped[str] = mapped_column(String(32), index=True)
    topic: Mapped[str | None] = mapped_column(String(128), nullable=True)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class IngestionError(Base):
    """坏消息死信：错误 JSON / 缺字段 / 未知断面 / 超量程等，供 P12 诊断。"""

    __tablename__ = "ingestion_errors"

    error_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(16), default="MQTT")  # MQTT/IMPORT
    topic: Mapped[str | None] = mapped_column(String(128), nullable=True)
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str] = mapped_column(String(256))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
