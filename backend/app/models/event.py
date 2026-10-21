"""变化事件、活动事件、范围版本、状态迁移、时序关系。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, utc_now


class ChangeEvent(Base, TimestampMixin):
    """规则识别出的一次指标变化（区别于持续研判的 ActiveEvent）。"""

    __tablename__ = "change_events"

    change_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    reach_id: Mapped[str] = mapped_column(String(32), index=True)
    metric: Mapped[str] = mapped_column(String(48))
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    baseline: Mapped[float | None] = mapped_column(Float, nullable=True)
    magnitude: Mapped[float] = mapped_column(Float)
    direction: Mapped[str] = mapped_column(String(16))  # UP / DOWN / LEVEL
    rule_id: Mapped[str] = mapped_column(String(48))
    event_id: Mapped[str | None] = mapped_column(
        ForeignKey("active_events.event_id"), nullable=True, index=True
    )
    observation_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组


class ActiveEvent(Base, TimestampMixin):
    """持续组织变化与证据的业务事件；后续证据优先更新同一 event_id。"""

    __tablename__ = "active_events"

    event_id: Mapped[str] = mapped_column(String(48), primary_key=True)  # TW-E01
    title: Mapped[str] = mapped_column(String(128))
    event_type: Mapped[str] = mapped_column(String(48))
    status: Mapped[str] = mapped_column(String(24), default="OPEN", index=True)
    priority: Mapped[str] = mapped_column(String(16), default="NORMAL")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    version: Mapped[int] = mapped_column(Integer, default=1)
    rule_version: Mapped[str] = mapped_column(String(32), default="demo-rules-v1")
    separation_rule_hit: Mapped[bool] = mapped_column(default=False)
    trigger_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class EventScope(Base):
    """事件范围按版本留痕，支持“再评估差异”回放。"""

    __tablename__ = "event_scopes"
    __table_args__ = (
        UniqueConstraint("event_id", "version", name="uq_event_scope_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("active_events.event_id"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    reaches_json: Mapped[str] = mapped_column(Text, default="[]")
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class EventStatusTransition(Base):
    """每次状态迁移留痕：原状态/新状态/触发/依据/操作者/规则版本。"""

    __tablename__ = "event_status_transitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("active_events.event_id"), index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    to_status: Mapped[str] = mapped_column(String(24))
    trigger: Mapped[str] = mapped_column(String(24))  # RULE / MANUAL / SCENARIO
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String(64), default="SYSTEM")
    rule_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class TemporalRelation(Base):
    """跨断面变化的时序关系：只陈述观察到的先后，不证明因果。"""

    __tablename__ = "temporal_relations"

    relation_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    from_change_id: Mapped[str] = mapped_column(
        ForeignKey("change_events.change_id"), index=True
    )
    to_change_id: Mapped[str] = mapped_column(
        ForeignKey("change_events.change_id"), index=True
    )
    delta_seconds: Mapped[float] = mapped_column(Float)
    relation_type: Mapped[str] = mapped_column(String(32), default="OBSERVED_SEQUENCE")
    evidence_state: Mapped[str] = mapped_column(String(24), default="OBSERVED_SEQUENCE")
    run_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
