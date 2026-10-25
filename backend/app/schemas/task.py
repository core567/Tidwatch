"""巡检任务契约。"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

# E 阶段 7 态：新增 DRAFT / APPROVED；SUBMITTED 语义收窄为“待复核”
TaskStatus = Literal[
    "DRAFT", "PENDING", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "CANCELLED",
]
Conclusion = Literal["NORMAL", "ABNORMAL", "UNCERTAIN"]


class ReviewBrief(CamelModel):
    decision: str
    comment: str = ""
    reviewer: str
    reviewed_at: datetime


class TaskOut(CamelModel):
    task_id: str
    event_id: str | None = None
    focus_id: str | None = None
    reach_id: str
    action_type: str
    title: str
    priority: str
    status: TaskStatus
    assignee: str | None = None
    due_at: datetime | None = None
    reason: str = ""
    result_note: str | None = None
    result_conclusion: Conclusion | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    observed_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    # E 增量字段（旧客户端可忽略）
    draft: bool = False
    latest_version: int = 0
    latest_review: ReviewBrief | None = None


class CreateTaskIn(CamelModel):
    event_id: str | None = None
    focus_id: str | None = None
    reach_id: str
    action_type: str = "MANUAL_CHECK"
    title: str = Field(min_length=2, max_length=200)
    priority: str = "NORMAL"
    due_at: datetime | None = None
    reason: str = ""
    assignee: str | None = None
    # E：true 创建为草稿（DRAFT），默认 false 直接派发为 PENDING（旧行为）
    draft: bool = False


class UpdateDraftIn(CamelModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    priority: str | None = None
    reason: str | None = None
    reach_id: str | None = None
    due_at: datetime | None = None


# 旧动作 ACCEPT/START/CANCEL 保留；新增 DISPATCH/APPROVE/REJECT
TaskAction = Literal[
    "ACCEPT", "START", "CANCEL", "DISPATCH", "APPROVE", "REJECT",
]


class TaskActionIn(CamelModel):
    action: TaskAction
    reason: str | None = None
    # 复核意见：REJECT 必填（服务端校验）
    comment: str | None = None


class SubmitTaskIn(CamelModel):
    observation_note: str = Field(min_length=1, max_length=2000)
    conclusion: Conclusion
    attachment_ids: list[str] = Field(default_factory=list)
    observed_at: datetime | None = None
    # 小程序现场端可表达“建议再评估”，是否再评估由后端决定
    request_reevaluate: bool | None = None
    # E：本次提交的复测指标（结构化，可空）
    measurements: list[dict] | None = None


class SubmissionOut(CamelModel):
    submission_id: str
    task_id: str
    version: int
    observation_note: str
    conclusion: Conclusion
    measurements: list = Field(default_factory=list)
    observed_at: datetime
    attachment_ids: list[str] = Field(default_factory=list)
    submitted_by: str
    submitted_at: datetime
    superseded_at: datetime | None = None


class TaskReviewOut(CamelModel):
    review_id: str
    task_id: str
    submission_id: str
    version: int
    decision: str
    comment: str = ""
    reviewer: str
    reviewed_at: datetime
