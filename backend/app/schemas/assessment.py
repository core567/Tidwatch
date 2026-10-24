"""再评估版本契约。"""
from __future__ import annotations

from datetime import datetime

from app.schemas.base import CamelModel


class AssessmentOut(CamelModel):
    id: int
    event_id: str
    assessment_version: int
    rule_version: str
    previous_scope: list[str]
    current_scope: list[str]
    scope_change_reason: str | None = None
    hypothesis_changes: list[dict] = []
    task_suggestions: list[str] = []
    warnings: list[str] = []
    trigger_reason: str | None = None
    created_at: datetime
