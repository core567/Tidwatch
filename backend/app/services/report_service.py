"""研判单生成服务（GRP《异常事件演化研判单》）。

聚合事件不可变快照：窗口、涉及范围、证据、再评估版本、未解决问题、
状态轨迹与人工处置，用于打印/导出。报告生成后即固定，不随后续变化改变。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.event import (
    ActiveEvent,
    ChangeEvent,
    EventScope,
    EventStatusTransition,
    TemporalRelation,
)
from app.models.evidence import Evidence, Hypothesis
from app.models.focus import BlindSpot, ObservationFocus
from app.models.workflow import Assessment, EventReview, RunTrace
from app.models.workflow import InspectionTask


def _id() -> str:
    return f"rpt-{uuid.uuid4().hex[:16]}"


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _scope_history(db: Session, event_id: str) -> list[dict]:
    rows = db.execute(
        select(EventScope).where(EventScope.event_id == event_id)
        .order_by(EventScope.version)
    ).scalars()
    return [
        {"version": s.version, "reaches": json.loads(s.reaches_json),
         "reason": s.change_reason, "createdAt": s.created_at.isoformat() if s.created_at else None}
        for s in rows
    ]


def build_review_payload(db: Session, event_id: str) -> dict:
    event = db.get(ActiveEvent, event_id)
    if event is None:
        raise NotFoundError("活动事件", event_id)

    evidence = db.execute(
        select(Evidence).where(Evidence.event_id == event_id)
        .order_by(Evidence.created_at)
    ).scalars().all()
    hypotheses = db.execute(
        select(Hypothesis).where(Hypothesis.event_id == event_id)
    ).scalars().all()
    assessments = db.execute(
        select(Assessment).where(Assessment.event_id == event_id)
        .order_by(Assessment.assessment_version)
    ).scalars().all()
    transitions = db.execute(
        select(EventStatusTransition).where(
            EventStatusTransition.event_id == event_id
        ).order_by(EventStatusTransition.id)
    ).scalars().all()
    focuses = db.execute(
        select(ObservationFocus).where(ObservationFocus.event_id == event_id)
    ).scalars().all()
    blind_spots = db.execute(
        select(BlindSpot).where(BlindSpot.event_id == event_id)
    ).scalars().all()
    tasks = db.execute(
        select(InspectionTask).where(InspectionTask.event_id == event_id)
    ).scalars().all()
    traces = db.execute(
        select(RunTrace).where(RunTrace.event_id == event_id)
        .order_by(RunTrace.created_at)
    ).scalars().all()

    # 时序关系（跨变化）
    relations = db.execute(
        select(TemporalRelation).where(
            TemporalRelation.from_change_id.in_(
                select(ChangeEvent.change_id).where(ChangeEvent.event_id == event_id)
            )
        )
    ).scalars().all()

    latest_scope = json.loads(
        db.execute(
            select(EventScope.reaches_json)
            .where(EventScope.event_id == event_id)
            .order_by(EventScope.version.desc()).limit(1)
        ).scalar_one_or_none() or "[]"
    )

    # 未解决项：NOT_SUPPORT/OPEN 假设、未完成任务、开放盲区、缺失/反证证据
    unresolved: list[str] = []
    for h in hypotheses:
        if h.state in ("OPEN", "NOT_SUPPORT", "UNKNOWN"):
            unresolved.append(f"假设[{h.state}]：{h.statement}")
    for t in tasks:
        if t.status not in ("SUBMITTED", "CANCELLED"):
            unresolved.append(f"任务未完成：{t.title}（{t.status}）")
    for b in blind_spots:
        if b.end_at is None:
            unresolved.append(f"监测盲区未消除：{b.reach_id}（{b.reason}）")

    supporting = [
        {"id": e.evidence_id, "type": e.type, "polarity": e.polarity,
         "note": e.note, "sourceRef": e.source_ref, "by": e.created_by,
         "at": _aware(e.observed_at or e.created_at).isoformat() if _aware(e.observed_at or e.created_at) else None}
        for e in evidence if e.polarity == "SUPPORT"
    ]
    counters = [
        {"id": e.evidence_id, "type": e.type, "polarity": e.polarity,
         "note": e.note, "sourceRef": e.source_ref, "by": e.created_by}
        for e in evidence if e.polarity in ("COUNTER", "MISSING")
    ]

    return {
        "eventId": event.event_id,
        "title": event.title,
        "status": event.status,
        "priority": event.priority,
        "eventType": event.event_type,
        "firstSeenAt": _aware(event.first_seen_at).isoformat() if event.first_seen_at else None,
        "updatedAt": _aware(event.updated_at).isoformat() if event.updated_at else None,
        "ruleVersion": event.rule_version,
        "scope": latest_scope,
        "scopeHistory": _scope_history(db, event_id),
        "temporalRelations": [
            {"from": r.from_change_id, "to": r.to_change_id,
             "deltaSeconds": r.delta_seconds, "type": r.relation_type,
             "note": "时序先后不构成因果证明"}
            for r in relations
        ],
        "hypotheses": [
            {"id": h.hypothesis_id, "statement": h.statement, "state": h.state,
             "support": len(json.loads(h.support_refs or "[]")),
             "counter": len(json.loads(h.counter_refs or "[]"))}
            for h in hypotheses
        ],
        "assessments": [
            {"version": a.assessment_version,
             "previousScope": json.loads(a.previous_scope_json or "[]"),
             "currentScope": json.loads(a.current_scope_json or "[]"),
             "reason": a.scope_change_reason,
             "warnings": json.loads(a.warnings_json or "[]"),
             "trigger": a.trigger_reason}
            for a in assessments
        ],
        "supportingEvidence": supporting,
        "counterEvidence": counters,
        "focuses": [
            {"reachId": f.reach_id, "status": f.status, "reason": f.reason}
            for f in focuses
        ],
        "blindSpots": [
            {"reachId": b.reach_id, "resolved": b.end_at is not None,
             "reason": b.reason, "impact": b.impact}
            for b in blind_spots
        ],
        "tasks": [
            {"id": t.task_id, "reachId": t.reach_id, "title": t.title,
             "status": t.status, "conclusion": t.result_conclusion,
             "note": t.result_note}
            for t in tasks
        ],
        "unresolved": unresolved,
        "trace": [
            {"actor": tr.actor, "action": tr.action, "detail": tr.detail,
             "at": tr.created_at.isoformat() if tr.created_at else None}
            for tr in traces
        ],
        "disclaimer": "本研判单基于 demo-rules-v1 教学阈值与模拟/公开数据生成，"
                      "时序关系仅为观测先后，不构成因果结论，不替代专业判断。",
    }


def persist_review(db: Session, event_id: str, created_by: str = "SYSTEM") -> EventReview:
    """生成（或重新生成）研判单并持久化。"""
    payload = build_review_payload(db, event_id)
    review = db.query(EventReview).filter_by(event_id=event_id).first()
    if review is None:
        review = EventReview(review_id=_id(), event_id=event_id)
        db.add(review)
    review.assessment = json.dumps(
        {"assessmentVersion": len(payload["assessments"]), "status": payload["status"]},
        ensure_ascii=False,
    )
    review.evidence_snapshot_json = json.dumps(payload, ensure_ascii=False, default=str)
    review.unresolved = json.dumps(payload["unresolved"], ensure_ascii=False)
    review.next_steps = json.dumps(
        [t["title"] for t in payload["tasks"] if t["status"] not in ("SUBMITTED", "CANCELLED")],
        ensure_ascii=False,
    )
    review.created_by = created_by
    return review
