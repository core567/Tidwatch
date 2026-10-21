"""活动事件、状态迁移、时序关系、变化事件契约。"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

EventStatus = Literal[
    "OPEN",
    "INVESTIGATING",
    "MONITORING",
    "ESCALATED",
    "NARROWED",
    "RECOVERY_PENDING",
    "RECOVERED",
    "UNRESOLVED",
]

# 前端人工操作动作；具体落到哪个目标状态由后端状态机决定
EventAction = Literal[
    "START_INVESTIGATION",
    "ESCALATE",
    "KEEP_MONITORING",
    "NARROW_SCOPE",
    "MARK_RECOVERY_PENDING",
    "CONFIRM_RECOVERED",
    "MARK_UNRESOLVED",
    "REOPEN",
]


class EventListItem(CamelModel):
    event_id: str
    title: str
    event_type: str
    status: EventStatus
    priority: Literal["LOW", "NORMAL", "HIGH"]
    scope_reach_ids: list[str] = Field(default_factory=list)
    first_seen_at: datetime
    updated_at: datetime
    version: int
    rule_version: str


class EventStatusTransitionOut(CamelModel):
    from_status: EventStatus | None
    to_status: EventStatus
    trigger: str  # RULE / MANUAL / SCENARIO
    reason: str | None = None
    actor: str
    rule_version: str
    created_at: datetime


class EventDetail(CamelModel):
    event_id: str
    title: str
    event_type: str
    status: EventStatus
    priority: Literal["LOW", "NORMAL", "HIGH"]
    scope_reach_ids: list[str]
    first_seen_at: datetime
    updated_at: datetime
    version: int
    rule_version: str
    transitions: list[EventStatusTransitionOut] = Field(default_factory=list)


class EventActionRequest(CamelModel):
    action: EventAction
    reason: str | None = Field(default=None, max_length=500)
    actor: str | None = None  # 来自 JWT 时忽略请求体中的值


class ChangeEventOut(CamelModel):
    change_id: str
    reach_id: str
    metric: str
    window_start: datetime
    window_end: datetime
    magnitude: float
    direction: str
    rule_id: str
    event_id: str | None = None


class TemporalRelationOut(CamelModel):
    relation_id: str
    from_change_id: str
    to_change_id: str
    delta_seconds: float
    relation_type: str = "OBSERVED_SEQUENCE"
    evidence_state: str
    created_at: datetime
