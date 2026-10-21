"""巡检任务与结果回填契约。"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

TaskActionType = Literal[
    "CONTINUE_OBSERVE",
    "FOCUS_REACH_B",
    "FOCUS_REACH_C",
    "KEEP_LOCAL_SCOPE",
    "INSPECT_DATA_LINK",
    "MANUAL_CHECK",
    "RE_EVALUATE_AFTER_RECOVERY",
]

TaskStatus = Literal["PENDING", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "CANCELLED"]
TaskPriority = Literal["LOW", "NORMAL", "HIGH"]


class InspectionTaskOut(CamelModel):
    task_id: str
    event_id: str | None = None
    focus_id: str | None = None
    reach_id: str
    action_type: TaskActionType
    title: str
    priority: TaskPriority
    status: TaskStatus
    assignee: str | None = None
    due_at: datetime | None = None
    reason: str
    created_at: datetime
    result_note: str | None = None
    result_conclusion: str | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    completed_at: datetime | None = None


class TaskActionRequest(CamelModel):
    # 小程序流转：接收 / 开始 / 取消
    action: Literal["ACCEPT", "START", "CANCEL"]
    reason: str | None = Field(default=None, max_length=500)


class TaskResultRequest(CamelModel):
    observation_note: str = Field(min_length=1, max_length=2000)
    observed_at: datetime
    attachment_ids: list[str] = Field(default_factory=list)
    conclusion: Literal["NORMAL", "ABNORMAL", "UNCERTAIN"] | None = None
    request_reevaluate: bool = False
