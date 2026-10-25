"""活动事件查询与人工操作路由（GRP 8.2）。"""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.event import (
    ActiveEvent,
    ChangeEvent,
    EventScope,
    EventStatusTransition,
    TemporalRelation,
)
from app.models.evidence import Evidence
from app.models.focus import BlindSpot
from app.models.system import User
from app.models.workflow import InspectionTask
from app.rules.recommendations import build_recommendations
from app.rules.state_machine import allowed_actions as allowed_actions_fn
from app.schemas.common import PageResult
from app.services import timeline_service
from app.schemas.event import (
    EventActionRequest,
    EventDetail,
    EventListItem,
    EventStatusTransitionOut,
    EventTrigger,
    TemporalRelationOut,
)
from app.services.event_service import processor

router = APIRouter(prefix="/api/events", tags=["events"])

ACTIVE_VALUES = (
    "OPEN", "INVESTIGATING", "MONITORING", "ESCALATED", "NARROWED", "RECOVERY_PENDING",
)


def _latest_scope(db: Session, event_id: str) -> list[str]:
    row = db.execute(
        select(EventScope.reaches_json)
        .where(EventScope.event_id == event_id)
        .order_by(EventScope.version.desc())
        .limit(1)
    ).scalar_one_or_none()
    return json.loads(row or "[]")


def _to_list_item(db: Session, e: ActiveEvent) -> EventListItem:
    first_change = db.execute(
        select(ChangeEvent)
        .where(ChangeEvent.event_id == e.event_id)
        .order_by(ChangeEvent.window_start.asc(), ChangeEvent.change_id.asc())
        .limit(1)
    ).scalar_one_or_none()
    trigger = (
        EventTrigger(
            reach_id=first_change.reach_id,
            metric=first_change.metric,
            magnitude=first_change.magnitude,
            direction=first_change.direction,
            rule_id=first_change.rule_id,
        )
        if first_change is not None
        else None
    )
    return EventListItem(
        event_id=e.event_id,
        title=e.title,
        event_type=e.event_type,
        status=e.status,  # type: ignore[arg-type]
        priority=e.priority,  # type: ignore[arg-type]
        scope_reach_ids=_latest_scope(db, e.event_id),
        trigger=trigger,
        first_seen_at=e.first_seen_at,
        updated_at=e.updated_at,
        version=e.version,
        rule_version=e.rule_version,
    )


@router.get("", response_model=PageResult[EventListItem])
def list_events(
    status: str | None = None,
    reachId: str | None = None,
    priority: str | None = Query(default=None, description="HIGH/NORMAL/LOW"),
    q: str | None = Query(default=None, description="标题或事件编号模糊匹配"),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> PageResult[EventListItem]:
    stmt = select(ActiveEvent)
    if status == "ACTIVE":
        stmt = stmt.where(ActiveEvent.status.in_(ACTIVE_VALUES))
    elif status:
        stmt = stmt.where(ActiveEvent.status == status)
    if priority:
        stmt = stmt.where(ActiveEvent.priority == priority.upper())
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            (ActiveEvent.title.like(like)) | (ActiveEvent.event_id.like(like))
        )
    events = list(db.execute(stmt.order_by(ActiveEvent.first_seen_at.desc())).scalars())
    if reachId:
        events = [e for e in events if reachId in _latest_scope(db, e.event_id)]
    total = len(events)
    chunk = events[(page - 1) * pageSize: page * pageSize]
    return PageResult[EventListItem](
        items=[_to_list_item(db, e) for e in chunk],
        page=page, page_size=pageSize, total=total,
    )


@router.get("/{event_id}", response_model=EventDetail)
def get_event(
    event_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> EventDetail:
    e = db.get(ActiveEvent, event_id)
    if e is None:
        raise NotFoundError("活动事件", event_id)
    transitions = db.execute(
        select(EventStatusTransition)
        .where(EventStatusTransition.event_id == event_id)
        .order_by(EventStatusTransition.id)
    ).scalars()
    changes = db.execute(
        select(ChangeEvent.change_id).where(ChangeEvent.event_id == event_id)
    ).scalars().all()
    rels = db.execute(
        select(TemporalRelation).where(
            TemporalRelation.from_change_id.in_(changes)
            | TemporalRelation.to_change_id.in_(changes)
        )
    ).scalars()
    base = _to_list_item(db, e)
    return EventDetail(
        **base.model_dump(),
        transitions=[
            EventStatusTransitionOut(
                from_status=t.from_status,  # type: ignore[arg-type]
                to_status=t.to_status,  # type: ignore[arg-type]
                trigger=t.trigger, reason=t.reason, actor=t.actor,
                rule_version=t.rule_version, created_at=t.created_at,
            )
            for t in transitions
        ],
        temporal_relations=[
            TemporalRelationOut(
                relation_id=r.relation_id,
                from_change_id=r.from_change_id,
                to_change_id=r.to_change_id,
                delta_seconds=r.delta_seconds,
                relation_type=r.relation_type,
                evidence_state=r.evidence_state,
                created_at=r.created_at,
            )
            for r in rels
        ],
        change_count=len(changes),
        allowed_actions=allowed_actions_fn(e.status),
    )


@router.get("/{event_id}/timeline")
def event_timeline(
    event_id: str,
    types: str | None = Query(default=None, description="逗号分隔的 biz_type 过滤"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """统一业务时间线（只读 business_events），可按 biz_type 过滤。"""
    if db.get(ActiveEvent, event_id) is None:
        raise NotFoundError("活动事件", event_id)
    type_list = [t.strip().upper() for t in (types.split(",") if types else []) if t.strip()] or None
    return {"items": timeline_service.list_for_event(db, event_id, type_list)}


@router.get("/{event_id}/recommendations")
def event_recommendations(
    event_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """规则生成的处置建议（非 AI）；只给建议，不改变状态。"""
    e = db.get(ActiveEvent, event_id)
    if e is None:
        raise NotFoundError("活动事件", event_id)
    scope = _latest_scope(db, event_id)

    tasks = db.execute(
        select(InspectionTask).where(InspectionTask.event_id == event_id)
    ).scalars().all()
    task_dicts = [{"taskId": t.task_id, "status": t.status} for t in tasks]

    open_blind = [
        b.reach_id for b in db.execute(
            select(BlindSpot).where(BlindSpot.end_at.is_(None))
        ).scalars().all()
    ]
    has_manual = db.execute(
        select(Evidence.evidence_id).where(
            Evidence.event_id == event_id, Evidence.type == "MANUAL"
        ).limit(1)
    ).scalar_one_or_none() is not None

    items = build_recommendations(
        status=e.status,
        scope_reach_ids=scope,
        tasks=task_dicts,
        open_blindspot_reaches=open_blind,
        has_manual_evidence=has_manual,
    )
    return {"eventId": event_id, "source": "RULE", "ruleVersion": settings.rule_version,
            "items": items}


@router.get("/{event_id}/recovery-assessment")
def event_recovery_assessment(
    event_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """规则化恢复评估（只读）：三态结论 + 因子依据；不改变事件状态。"""
    from app.services import recovery_service
    return recovery_service.assess_recovery(db, event_id)


@router.post("/{event_id}/actions", response_model=EventListItem)
def event_action(
    event_id: str,
    body: EventActionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EventListItem:
    """人工状态操作；服务端状态机校验并写 Run Trace。actor 取自 JWT。"""
    updated = processor.apply_manual_action(
        db, event_id, body.action, user.user_id, body.reason
    )
    return _to_list_item(db, updated)
