"""用户、规则配置、场景运行、模型输出、知识条目。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, utc_now


class User(Base, TimestampMixin):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="inspector")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class RuleConfig(Base, TimestampMixin):
    """阈值与窗口版本化；演示阈值与正式标准分开存储。"""

    __tablename__ = "rule_configs"

    rule_version: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(128))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    params_json: Mapped[str] = mapped_column(Text, default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class ScenarioRun(Base, TimestampMixin):
    __tablename__ = "scenario_runs"

    run_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(String(16), index=True)  # S1..S5
    seed: Mapped[int] = mapped_column(Integer)
    params_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(16), default="STARTED")
    speed: Mapped[Float] = mapped_column(Float, default=1.0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    stopped_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ModelOutput(Base):
    """轻量模型输出独立成表，永不直接改写观测事实或事件状态。"""

    __tablename__ = "model_outputs"

    output_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    model_version: Mapped[str] = mapped_column(String(32), index=True)
    reach_id: Mapped[str] = mapped_column(String(32), index=True)
    input_window_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    input_window_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    features_json: Mapped[str] = mapped_column(Text, default="{}")
    output: Mapped[str] = mapped_column(String(32))
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    input_evidence_refs: Mapped[str] = mapped_column(Text, default="[]")
    run_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    inferred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class KnowledgeEntry(Base, TimestampMixin):
    """P06 知识条目（术语解释/专业边界），可选 RAG 的本地语料。"""

    __tablename__ = "knowledge_entries"

    entry_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    title: Mapped[str] = mapped_column(String(128))
    content: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tags: Mapped[str] = mapped_column(String(256), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
