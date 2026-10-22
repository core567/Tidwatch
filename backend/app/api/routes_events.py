"""活动事件查询与人工操作路由（GRP 8.2）。"""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.event import (
    ActiveEvent,
    ChangeEvent,
    EventScope,
    EventStatusTransition,
    TemporalRelation,
)
from app.models.system import User
from app.schemas.common import PageResult
from app.schemas.event import (
    EventActionRequest,
    EventDetail,
    EventListItem,
    EventStatusTransitionOut,
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
    return EventListItem(
        event_id=e.event_id,
        title=e.title,
        event_type=e.event_type,
        status=e.status,  # type: ignore[arg-type]
        priority=e.priority,  # type: ignore[arg-type]
        scope_reach_ids=_latest_scope(db, e.event_id),
        first_seen_at=e.first_seen_at,
        updated_at=e.updated_at,
        version=e.version,
        rule_version=e.rule_version,
    )


@router.get("", response_model=PageResult[EventListItem])
def list_events(
    status: str | None = None,
    reachId: str | None = None,
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
    )


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
