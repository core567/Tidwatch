"""再评估服务（GRP 5.4）。

每次有新证据（变化确认/任务回填/迟到数据）对同一事件重新评价，
生成不可变版本 Assessment，记录范围前后差异、假设状态、任务建议与警告。
新证据优先更新既有事件（同 eventId），版本差异用于研判工作台展示。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.evidence import Hypothesis
from app.models.workflow import Assessment, RunTrace

REQUIRED_WINDOW = "验证窗口：关注下游断面在约 10–20 分钟内是否出现同向持续变化"


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def next_version(db: Session, event_id: str) -> int:
    last = db.execute(
        select(Assessment.assessment_version)
        .where(Assessment.event_id == event_id)
        .order_by(Assessment.assessment_version.desc())
        .limit(1)
    ).scalar_one_or_none()
    return (last or 0) + 1


def create_assessment(
    db: Session,
    event_id: str,
    previous_scope: list[str],
    current_scope: list[str],
    *,
    hypothesis_snapshot: list[dict] | None = None,
    reason: str = "",
    task_suggestions: list[str] | None = None,
    warnings: list[str] | None = None,
    trigger_reason: str | None = None,
    actor: str = "SYSTEM",
) -> Assessment:
    """写入一个再评估版本。范围变化时给出明确原因。"""
    added = [r for r in current_scope if r not in previous_scope]
    removed = [r for r in previous_scope if r not in current_scope]
    if added and not reason:
        reason = f"新增证据支持范围扩展：{', '.join(added)}"

    hypotheses = hypothesis_snapshot or _hypothesis_snapshot(db, event_id)
    warnings = warnings or []
    tasks = task_suggestions or _suggest_tasks(current_scope, hypotheses, added)

    version = next_version(db, event_id)
    a = Assessment(
        event_id=event_id,
        assessment_version=version,
        rule_version=settings.rule_version,
        previous_scope_json=json.dumps(previous_scope, ensure_ascii=False),
        current_scope_json=json.dumps(current_scope, ensure_ascii=False),
        scope_change_reason=reason,
        hypothesis_changes_json=json.dumps(hypotheses, ensure_ascii=False),
        task_suggestions_json=json.dumps(tasks, ensure_ascii=False),
        warnings_json=json.dumps(warnings, ensure_ascii=False),
        trigger_reason=trigger_reason,
    )
    db.add(a)
    db.flush()
    db.add(RunTrace(
        trace_id=_id("trc"),
        event_id=event_id,
        actor=actor,
        action="assessment.created",
        input_refs=json.dumps(previous_scope),
        output_refs=json.dumps([a.id]),
        rule_version=settings.rule_version,
        detail=f"v{version}: {reason or '再评估'}",
    ))
    from app.services import timeline_service
    timeline_service.record(
        db,
        biz_type=timeline_service.BIZ_ASSESSMENT,
        action_type="assessment.created",
        event_ref=event_id,
        actor=actor,
        description=f"再评估 v{version}：{reason or '范围与假设复核'}",
        evidence_refs=[a.id],
    )
    return a


def _hypothesis_snapshot(db: Session, event_id: str) -> list[dict]:
    rows = db.execute(
        select(Hypothesis).where(Hypothesis.event_id == event_id)
    ).scalars()
    out = []
    for h in rows:
        out.append({
            "hypothesisId": h.hypothesis_id,
            "state": h.state,
            "support": len(json.loads(h.support_refs or "[]")),
            "counter": len(json.loads(h.counter_refs or "[]")),
        })
    return out


def _suggest_tasks(scope, hypotheses: list[dict], added: list[str]) -> list[str]:
    suggestions: list[str] = []
    # 下游未确认 → 持续观察
    order = ["reach-a", "reach-b", "reach-c"]
    for r in scope:
        idx = order.index(r) if r in order else -1
        if idx >= 0 and idx + 1 < len(order):
            nxt = order[idx + 1]
            if nxt not in scope:
                suggestions.append(f"CONTINUE_OBSERVE:{nxt}")
    # 存在未支持/反证假设时建议人工核查
    if any(h["state"] in ("NOT_SUPPORT", "PARTIAL_SUPPORT") for h in hypotheses):
        suggestions.append("MANUAL_CHECK:evidence")
    return suggestions


def list_assessments(db: Session, event_id: str) -> list[Assessment]:
    return list(db.execute(
        select(Assessment)
        .where(Assessment.event_id == event_id)
        .order_by(Assessment.assessment_version)
    ).scalars())


def latest_assessment(db: Session, event_id: str) -> Assessment | None:
    return db.execute(
        select(Assessment)
        .where(Assessment.event_id == event_id)
        .order_by(Assessment.assessment_version.desc())
        .limit(1)
    ).scalar_one_or_none()


def downgrade_unsupported_hypotheses(db: Session, event_id: str) -> list[str]:
    """下游未出现同向变化（S4 反例）：传播假设降级为 NOT_SUPPORTED。

    包含初始 OPEN 状态的传播假设（窗口到期仍无下游证据）。
    """
    changed: list[str] = []
    rows = db.execute(
        select(Hypothesis).where(
            Hypothesis.event_id == event_id,
            Hypothesis.state.in_(
                ["OPEN", "SUPPORT", "PARTIAL_SUPPORT", "UNKNOWN"]
            ),
        )
    ).scalars()
    for h in rows:
        # 仅降级“向下游传播/同向变化”的假设，避免误伤其他解释
        if not any(k in h.statement for k in ("传播", "同向", "下游")):
            continue
        h.state = "NOT_SUPPORT"
        changed.append(h.hypothesis_id)
    return changed
