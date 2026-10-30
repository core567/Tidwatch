"""站内通知（V2.2 PC 复核 → 小程序协同）。

最小持久化通知：每条 PC 复核（退回/通过）在同一事务内生成且仅生成一条，
关联任务 / 提交版本 / 复核记录 / 接收人；现场端拉取、数未读、标记已读。
只读追加，不做更新/删除；断线重连后可按 created_at 补拉。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now


class Notification(Base):
    __tablename__ = "notifications"

    notification_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    # 业务类型：TASK_REJECTED / TASK_APPROVED（可扩展，不与任务状态混用）
    type: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")

    task_id: Mapped[str] = mapped_column(
        ForeignKey("inspection_tasks.task_id"), index=True
    )
    submission_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    review_id: Mapped[str | None] = mapped_column(String(48), nullable=True)

    # 接收人（与任务 assignee 口径一致）；按接收人过滤，不广播他人通知
    recipient_id: Mapped[str] = mapped_column(String(64), index=True)
    created_by: Mapped[str] = mapped_column(String(64), default="SYSTEM")

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
