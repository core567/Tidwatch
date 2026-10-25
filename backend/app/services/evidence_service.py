"""证据与假设服务（GRP 3.2 / 5.3）。

证据三性：
- polarity: SUPPORT（支持）/ COUNTER（反证）/ MISSING（缺失）
- 来源分类型记录：OBSERVATION 观测 / RULE 规则输出 / MANUAL 人工 /
  EXTERNAL 外部 / MODEL 模型 / KNOWLEDGE 知识
- 每条证据可回指 source_ref（changeId / observationId / 任务等），可追溯。

假设是对"事件原因/趋势"的待验证解释，不直接驱动状态机。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models.evidence import Evidence, Hypothesis
from app.models.workflow import RunTrace

HYPOTHESIS_STATES = (
    "OPEN",
    "PARTIAL_SUPPORT",
    "SUPPORT",
    "NOT_SUPPORT",
    "UNKNOWN",
)
EVIDENCE_TYPES = ("OBSERVATION", "RULE", "MANUAL", "EXTERNAL", "MODEL", "KNOWLEDGE")
POLARITIES = ("SUPPORT", "COUNTER", "MISSING")


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def add_evidence(
    db: Session,
    event_id: str,
    *,
    type: str,
    source_ref: str,
    polarity: str,
    note: str | None = None,
    quality_flag: str | None = None,
    created_by: str = "SYSTEM",
    observed_at: datetime | None = None,
) -> Evidence:
    if type not in EVIDENCE_TYPES:
        raise AppError("BAD_EVIDENCE_TYPE", f"证据类型非法: {type}", 422)
    if polarity not in POLARITIES:
        raise AppError("BAD_POLARITY", f"证据立场非法: {polarity}", 422)
    evidence = Evidence(
        evidence_id=_id("evi"),
        event_id=event_id,
        type=type,
        source_ref=source_ref,
        polarity=polarity,
        quality_flag=quality_flag or "GOOD",
        note=note,
        created_by=created_by,
        observed_at=observed_at,
    )
    db.add(evidence)
    db.add(RunTrace(
        trace_id=_id("trc"),
        event_id=event_id,
        actor=created_by,
        action="evidence.added",
        input_refs=json.dumps([source_ref], ensure_ascii=False),
        output_refs=json.dumps([evidence.evidence_id], ensure_ascii=False),
        rule_version="manual",
        detail=f"{type}/{polarity}: {note or ''}",
    ))
    from app.services import timeline_service
    timeline_service.record(
        db,
        biz_type=timeline_service.BIZ_EVIDENCE,
        action_type="evidence.added",
        event_ref=event_id,
        actor=created_by,
        description=f"人工证据（{type}/{polarity}）：{note or ''}"[:500],
        evidence_refs=[evidence.evidence_id],
    )
    return evidence


def list_evidence(db: Session, event_id: str) -> list[Evidence]:
    return list(db.execute(
        select(Evidence)
        .where(Evidence.event_id == event_id)
        .order_by(Evidence.created_at)
    ).scalars())


def create_hypothesis(
    db: Session,
    event_id: str,
    statement: str,
    *,
    basis_evidence: list[str] | None = None,
    created_by: str = "analyst",
) -> Hypothesis:
    h = Hypothesis(
        hypothesis_id=_id("hyp"),
        event_id=event_id,
        statement=statement,
        state="OPEN",
        support_refs="[]",
        counter_refs="[]",
        run_id=None,
    )
    db.add(h)
    db.flush()
    if basis_evidence:
        link_evidence(db, h.hypothesis_id, "SUPPORT", basis_evidence, actor=created_by)
    db.add(RunTrace(
        trace_id=_id("trc"),
        event_id=event_id,
        actor=created_by,
        action="hypothesis.created",
        input_refs=json.dumps(basis_evidence or []),
        output_refs=json.dumps([h.hypothesis_id]),
        rule_version="manual",
        detail=statement[:200],
    ))
    return h


def link_evidence(
    db: Session,
    hypothesis_id: str,
    polarity: str,
    evidence_ids: list[str],
    *,
    actor: str = "analyst",
) -> Hypothesis:
    h = db.get(Hypothesis, hypothesis_id)
    if h is None:
        raise NotFoundError("假设", hypothesis_id)
    import json

    support = set(json.loads(h.support_refs or "[]"))
    counter = set(json.loads(h.counter_refs or "[]"))
    target = support if polarity == "SUPPORT" else counter
    other = counter if polarity == "SUPPORT" else support
    for eid in evidence_ids:
        if not db.get(Evidence, eid):
            raise NotFoundError("证据", eid)
        target.add(eid)
        other.discard(eid)
    h.support_refs = json.dumps(sorted(support), ensure_ascii=False)
    h.counter_refs = json.dumps(sorted(counter), ensure_ascii=False)
    h.state = _derive_state(len(support), len(counter))
    db.add(RunTrace(
        trace_id=_id("trc"),
        event_id=h.event_id,
        actor=actor,
        action="hypothesis.linked",
        input_refs=json.dumps(evidence_ids),
        output_refs=json.dumps([h.hypothesis_id]),
        rule_version="manual",
        detail=f"{polarity} x{len(evidence_ids)} → {h.state}",
    ))
    return h


def _derive_state(support_count: int, counter_count: int) -> str:
    """证据增减驱动假设状态（结论强度不得超过证据）。"""
    if support_count and not counter_count:
        return "SUPPORT" if support_count >= 2 else "PARTIAL_SUPPORT"
    if counter_count and not support_count:
        return "NOT_SUPPORT"
    if support_count and counter_count:
        return "PARTIAL_SUPPORT"
    return "OPEN"


def list_hypotheses(db: Session, event_id: str) -> list[Hypothesis]:
    return list(db.execute(
        select(Hypothesis)
        .where(Hypothesis.event_id == event_id)
        .order_by(Hypothesis.created_at)
    ).scalars())
