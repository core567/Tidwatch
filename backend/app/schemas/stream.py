"""实时推送消息信封（PC SSE / 小程序 WS 共用）。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.base import CamelModel

MessageType = Literal[
    "observation.created",
    "change.detected",
    "event.created",
    "event.updated",
    "event.status-changed",
    "focus.updated",
    "blindspot.created",
    "blindspot.resolved",
    "task.created",
    "task.updated",
    "reach.status-changed",
    "ping",
]


class StreamMessage(CamelModel):
    message_id: str
    message_type: MessageType
    scenario_id: str | None = None
    sent_at: datetime
    payload: dict[str, Any] = Field(default_factory=dict)
