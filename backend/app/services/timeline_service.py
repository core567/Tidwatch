"""统一业务时间线服务（business_events）。

record_*：与业务写入同一事务调用，只追加、不更新、不删除。
list_*：只读端点使用。
backfill：迁移脚本由 run_traces / event_status_transitions 重建历史。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.audit import (
    BIZ_ASSESSMENT,
    BIZ_BLINDSPOT,
    BIZ_EVENT,
    BIZ_EVIDENCE,
    BIZ_TASK,
    BusinessEvent,
)

# run_traces.action → (biz_type, action_type, to_status 推导)
_TASK_ACTION_MAP = {
    "task.created": ("task.created", "PENDING"),
    "task.accept": ("task.accepted", "ACCEPTED"),
    "task.start": ("task.started", "IN_PROGRESS"),
    "task.cancel": ("task.cancelled", "CANCELLED"),
    "task.submitted": ("task.submitted", "SUBMITTED"),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def record(
    db: Session,
    *,
    biz_type: str,
    action_type: str,
    event_ref: str | None = None,
    task_ref: str | None = None,
    submission_ref: str | None = None,
    review_ref: str | None = None,
    actor: str = "SYSTEM",
    actor_role: str | None = None,
    from_status: str | None = None,
    to_status: str | None = None,
    description: str | None = None,
    evidence_refs: list | None = None,
    occurred_at: datetime | None = None,
    source: str = "live",
    commit_id: str | None = None,
) -> BusinessEvent:
    be = BusinessEvent(
        biz_type=biz_type,
        action_type=action_type,
        event_ref=event_ref,
        task_ref=task_ref,
        submission_ref=submission_ref,
        review_ref=review_ref,
        actor=actor or "SYSTEM",
        actor_role=actor_role,
        from_status=from_status,
        to_status=to_status,
        description=description,
        evidence_refs=json.dumps(evidence_refs or [], ensure_ascii=False),
        occurred_at=occurred_at or _now(),
        source=source,
    )
    db.add(be)
    return be


def _to_dict(be: BusinessEvent) -> dict:
    return {
        "eventId": be.event_id,
        "bizType": be.biz_type,
        "actionType": be.action_type,
        "eventRef": be.event_ref,
        "taskRef": be.task_ref,
        "submissionRef": be.submission_ref,
        "reviewRef": be.review_ref,
        "actor": be.actor,
        "actorRole": be.actor_role,
        "fromStatus": be.from_status,
        "toStatus": be.to_status,
        "description": be.description,
        "evidenceRefs": json.loads(be.evidence_refs or "[]"),
        "occurredAt": be.occurred_at,
        "source": be.source,
    }


def _query(db: Session, *, event_ref: str | None = None, task_ref: str | None = None,
           types: list[str] | None = None):
    stmt = select(BusinessEvent)
    conds = []
    if event_ref is not None:
        conds.append(BusinessEvent.event_ref == event_ref)
    if task_ref is not None:
        # 任务时间线：本任务的业务行，加上其所属事件上与具体任务无关的事件级动作
        from app.models.workflow import InspectionTask as _IT
        event_id = db.execute(
            select(_IT.event_id).where(_IT.task_id == task_ref)
        ).scalar_one_or_none()
        task_cond = BusinessEvent.task_ref == task_ref
        if event_id:
            conds.append(or_(
                task_cond,
                and_(BusinessEvent.task_ref.is_(None), BusinessEvent.event_ref == event_id),
            ))
        else:
            conds.append(task_cond)
    if types:
        conds.append(BusinessEvent.biz_type.in_(types))
    if conds:
        stmt = stmt.where(*conds)
    return stmt.order_by(BusinessEvent.occurred_at.asc(), BusinessEvent.created_at.asc())


def list_for_event(db: Session, event_id: str, types: list[str] | None = None) -> list[dict]:
    rows = db.execute(
        _query(db, event_ref=event_id, types=types)
    ).scalars().all()
    return [_to_dict(b) for b in rows]


def list_for_task(db: Session, task_id: str, types: list[str] | None = None) -> list[dict]:
    rows = db.execute(
        _query(db, task_ref=task_id, types=types)
    ).scalars().all()
    return [_to_dict(b) for b in rows]


def backfill(db: Session) -> dict:
    """由 event_status_transitions 与 run_traces 重建历史 business_events。

    幂等：已存在 source=backfill 则先跳过（按业务键去重），不重复写入。
    """
    from app.models.event import EventStatusTransition
    from app.models.workflow import RunTrace

    created = {"event.status-changed": 0, "task": 0, "skipped": 0}

    # 以完整业务键去重：同一事件可能在同一时刻发生多条迁移（如 OPEN 与自动研判），
    # 仅按 (action,event,时间) 会误并，必须带上 from/to 状态。
    existing = set()
    for be in db.execute(
        select(BusinessEvent).where(BusinessEvent.source == "backfill")
    ).scalars():
        existing.add((
            "event" if be.biz_type == BIZ_EVENT else "task",
            be.event_ref, be.task_ref, be.action_type,
            be.from_status, be.to_status, be.occurred_at,
        ))

    # 事件状态迁移
    transitions = db.execute(
        select(EventStatusTransition).order_by(EventStatusTransition.id.asc())
    ).scalars().all()
    for tr in transitions:
        key = ("event", tr.event_id, None, "event.status-changed",
               tr.from_status, tr.to_status, tr.created_at)
        if key in existing:
            created["skipped"] += 1
            continue
        existing.add(key)
        record(
            db,
            biz_type=BIZ_EVENT,
            action_type="event.status-changed",
            event_ref=tr.event_id,
            actor=tr.actor,
            from_status=tr.from_status,
            to_status=tr.to_status,
            description=(tr.reason or f"{tr.trigger} 状态迁移"),
            occurred_at=tr.created_at,
            source="backfill",
        )
        created["event.status-changed"] += 1

    # 任务 run_traces
    traces = db.execute(
        select(RunTrace).where(RunTrace.task_id.is_not(None)).order_by(RunTrace.created_at.asc())
    ).scalars().all()
    for t in traces:
        mapping = _TASK_ACTION_MAP.get(t.action)
        if mapping is None:
            continue
        action_type, to_status = mapping
        key = ("task", t.event_id, t.task_id, action_type, None, to_status, t.created_at)
        if key in existing:
            created["skipped"] += 1
            continue
        existing.add(key)
        record(
            db,
            biz_type=BIZ_TASK,
            action_type=action_type,
            event_ref=t.event_id,
            task_ref=t.task_id,
            actor=t.actor,
            to_status=to_status,
            description=t.detail,
            evidence_refs=json.loads(t.output_refs or "[]"),
            occurred_at=t.created_at,
            source="backfill",
        )
        created["task"] += 1

    return created
