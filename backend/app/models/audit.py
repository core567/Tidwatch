"""统一业务审计事件表（专用时间线，不拼装 run_traces/status_transitions）。

写点与业务写入同一事务；只读端点按 event_ref/task_ref 还原时间线。
引用列（event_ref/task_ref/...）使用带索引的字符串而非硬外键：
审计记录必须在业务行被清理时仍可保留，且 backfill 不被外键约束阻断。
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now

# 业务对象类型
BIZ_EVENT = "EVENT"
BIZ_TASK = "TASK"
BIZ_SUBMISSION = "SUBMISSION"
BIZ_REVIEW = "REVIEW"
BIZ_ASSESSMENT = "ASSESSMENT"
BIZ_EVIDENCE = "EVIDENCE"
BIZ_BLINDSPOT = "BLINDSPOT"
BIZ_ATTACHMENT = "ATTACHMENT"
BIZ_RECOVERY = "RECOVERY"

BIZ_TYPES = frozenset({
    BIZ_EVENT, BIZ_TASK, BIZ_SUBMISSION, BIZ_REVIEW, BIZ_ASSESSMENT,
    BIZ_EVIDENCE, BIZ_BLINDSPOT, BIZ_ATTACHMENT, BIZ_RECOVERY,
})


def new_event_id() -> str:
    return f"bev-{uuid.uuid4().hex[:24]}"


class BusinessEvent(Base):
    __tablename__ = "business_events"

    event_id: Mapped[str] = mapped_column(String(48), primary_key=True, default=new_event_id)

    # 业务对象分类与引用（均可空：附件类可能不关联事件）
    biz_type: Mapped[str] = mapped_column(String(16), index=True)
    event_ref: Mapped[str | None] = mapped_column(String(48), nullable=True)
    task_ref: Mapped[str | None] = mapped_column(String(48), nullable=True)
    submission_ref: Mapped[str | None] = mapped_column(String(48), nullable=True)
    review_ref: Mapped[str | None] = mapped_column(String(48), nullable=True)

    action_type: Mapped[str] = mapped_column(String(64))
    actor: Mapped[str] = mapped_column(String(64), default="SYSTEM")
    actor_role: Mapped[str | None] = mapped_column(String(32), nullable=True)

    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON：submission_id / attachment_ids / change_id 等证据指针
    evidence_refs: Mapped[str] = mapped_column(Text, default="[]")

    # live=业务实时写入；backfill=迁移脚本由历史表重建
    source: Mapped[str] = mapped_column(String(16), default="live")

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    __table_args__ = (
        Index("ix_business_events_event_ref", "event_ref"),
        Index("ix_business_events_task_ref", "task_ref"),
        Index("ix_business_events_occurred_at", "occurred_at"),
    )
