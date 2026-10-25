"""巡检任务、再评估版本、运行轨迹、事件复盘。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, utc_now


class InspectionTask(Base, TimestampMixin):
    __tablename__ = "inspection_tasks"

    task_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    event_id: Mapped[str | None] = mapped_column(
        ForeignKey("active_events.event_id"), nullable=True, index=True
    )
    focus_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    reach_id: Mapped[str] = mapped_column(String(32), index=True)
    action_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(128))
    priority: Mapped[str] = mapped_column(String(16), default="NORMAL")
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    assignee: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reason: Mapped[str] = mapped_column(Text, default="")

    # 结果回填
    result_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_conclusion: Mapped[str | None] = mapped_column(String(16), nullable=True)
    attachment_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON
    observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Assessment(Base):
    """再评估版本：范围变化、假设变化、任务建议均留版本。"""

    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("active_events.event_id"), index=True
    )
    assessment_version: Mapped[int] = mapped_column(Integer)
    rule_version: Mapped[str] = mapped_column(String(32))
    previous_scope_json: Mapped[str] = mapped_column(Text, default="[]")
    current_scope_json: Mapped[str] = mapped_column(Text, default="[]")
    scope_change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    hypothesis_changes_json: Mapped[str] = mapped_column(Text, default="[]")
    task_suggestions_json: Mapped[str] = mapped_column(Text, default="[]")
    warnings_json: Mapped[str] = mapped_column(Text, default="[]")
    trigger_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class RunTrace(Base):
    """操作/运行轨迹：事件每次变化都能回答“为什么”。"""

    __tablename__ = "run_traces"

    trace_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    event_id: Mapped[str | None] = mapped_column(
        ForeignKey("active_events.event_id"), nullable=True, index=True
    )
    task_id: Mapped[str | None] = mapped_column(
        ForeignKey("inspection_tasks.task_id"), nullable=True, index=True
    )
    actor: Mapped[str] = mapped_column(String(64), default="SYSTEM")  # SYSTEM/USER/SCENARIO
    action: Mapped[str] = mapped_column(String(64))
    input_refs: Mapped[str] = mapped_column(Text, default="[]")  # JSON
    output_refs: Mapped[str] = mapped_column(Text, default="[]")
    rule_version: Mapped[str] = mapped_column(String(32))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )


class EventReview(Base, TimestampMixin):
    __tablename__ = "event_reviews"

    review_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("active_events.event_id"), index=True
    )
    assessment: Mapped[str] = mapped_column(Text)
    unresolved: Mapped[str] = mapped_column(Text, default="")
    next_steps: Mapped[str] = mapped_column(Text, default="")
    evidence_snapshot_json: Mapped[str] = mapped_column(Text, default="{}")
    created_by: Mapped[str] = mapped_column(String(64), default="SYSTEM")


class TaskSubmission(Base):
    """现场提交版本（追加式，不更新不删除）。每次回填新增一行。"""

    __tablename__ = "task_submissions"
    __table_args__ = (
        UniqueConstraint("task_id", "version", name="uq_task_submission_version"),
    )

    submission_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    task_id: Mapped[str] = mapped_column(
        ForeignKey("inspection_tasks.task_id"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    observation_note: Mapped[str] = mapped_column(Text)
    conclusion: Mapped[str] = mapped_column(String(16))
    measurements_json: Mapped[str] = mapped_column(Text, default="[]")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attachment_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    submitted_by: Mapped[str] = mapped_column(String(64), default="SYSTEM")
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    # 被退回后该版本归档（不再是最新），历史行保留不删
    superseded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class TaskReview(Base):
    """PC 复核记录（追加式）：批准或退回及原因。"""

    __tablename__ = "task_reviews"

    review_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    task_id: Mapped[str] = mapped_column(
        ForeignKey("inspection_tasks.task_id"), index=True
    )
    submission_id: Mapped[str] = mapped_column(String(48), index=True)
    version: Mapped[int] = mapped_column(Integer)
    decision: Mapped[str] = mapped_column(String(16))  # APPROVED / REJECTED
    comment: Mapped[str] = mapped_column(Text, default="")
    reviewer: Mapped[str] = mapped_column(String(64), default="SYSTEM")
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
