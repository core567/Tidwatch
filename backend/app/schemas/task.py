"""巡检任务契约。"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

TaskStatus = Literal["PENDING", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "CANCELLED"]
Conclusion = Literal["NORMAL", "ABNORMAL", "UNCERTAIN"]


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


class TaskActionIn(CamelModel):
    action: Literal["ACCEPT", "START", "CANCEL"]


class SubmitTaskIn(CamelModel):
    observation_note: str = Field(min_length=1, max_length=2000)
    conclusion: Conclusion
    attachment_ids: list[str] = Field(default_factory=list)
    observed_at: datetime | None = None
