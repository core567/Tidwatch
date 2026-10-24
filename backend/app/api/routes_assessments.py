"""再评估版本查询路由。"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.event import ActiveEvent
from app.models.system import User
from app.models.workflow import Assessment
from app.schemas.assessment import AssessmentOut

router = APIRouter(prefix="/api/events", tags=["assessments"])


@router.get("/{event_id}/assessments", response_model=list[AssessmentOut])
def list_assessments(
    event_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[AssessmentOut]:
    if db.get(ActiveEvent, event_id) is None:
        raise NotFoundError("活动事件", event_id)
    rows = (
        db.query(Assessment)
        .filter(Assessment.event_id == event_id)
        .order_by(Assessment.assessment_version)
        .all()
    )
    return [
        AssessmentOut(
            id=a.id,
            eventId=a.event_id,
            assessmentVersion=a.assessment_version,
            ruleVersion=a.rule_version,
            previousScope=json.loads(a.previous_scope_json or "[]"),
            currentScope=json.loads(a.current_scope_json or "[]"),
            scopeChangeReason=a.scope_change_reason,
            hypothesisChanges=json.loads(a.hypothesis_changes_json or "[]"),
            taskSuggestions=json.loads(a.task_suggestions_json or "[]"),
            warnings=json.loads(a.warnings_json or "[]"),
            triggerReason=a.trigger_reason,
            createdAt=a.created_at,
        )
        for a in rows
    ]
