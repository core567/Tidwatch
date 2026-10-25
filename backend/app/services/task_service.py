"""巡检任务服务（GRP：观察重点→任务→现场记录→再评估）。

任务由系统（Focus）或人工（PC）派发；小程序端接受→开始→提交结果。
回填结果作为 MANUAL 证据进入事件，并触发一次再评估。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError

TASK_ACTIONS = {"ACCEPT", "START", "CANCEL"}
FINAL_STATUSES = {"SUBMITTED", "CANCELLED"}


def _id() -> str:
    return f"tsk-{uuid.uuid4().hex[:16]}"


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def create_task(
    db: Session,
    *,
    event_id: str | None,
    focus_id: str | None,
    reach_id: str,
    action_type: str,
    title: str,
    priority: str = "NORMAL",
    due_at: datetime | None = None,
    reason: str = "",
    assignee: str | None = None,
    created_by: str = "SYSTEM",
) -> "object":
    from app.models.workflow import InspectionTask

    task = InspectionTask(
        task_id=_id(),
        event_id=event_id,
        focus_id=focus_id,
        reach_id=reach_id,
        action_type=action_type,
        title=title,
        priority=priority,
        status="PENDING",
        due_at=due_at,
        reason=reason,
        assignee=assignee,
    )
    db.add(task)
    db.flush()
    _trace(db, task.task_id, event_id, created_by, "task.created",
           [reach_id], [task.task_id], reason)
    return task


def list_tasks(
    db: Session,
    *,
    status: str | None = None,
    assignee: str | None = None,
    event_id: str | None = None,
) -> list["object"]:
    from app.models.workflow import InspectionTask

    stmt = select(InspectionTask)
    if status:
        stmt = stmt.where(InspectionTask.status == status)
    if assignee:
        stmt = stmt.where(InspectionTask.assignee == assignee)
    if event_id:
        stmt = stmt.where(InspectionTask.event_id == event_id)
    return list(db.execute(
        stmt.order_by(InspectionTask.created_at.desc())
    ).scalars())


def get_task(db: Session, task_id: str):
    from app.models.workflow import InspectionTask

    task = db.get(InspectionTask, task_id)
    if task is None:
        raise NotFoundError("巡检任务", task_id)
    return task


def act_task(db: Session, task_id: str, action: str, *, actor: str,
             assignee: str | None = None):
    task = get_task(db, task_id)
    if action == "CANCEL":
        if task.status in FINAL_STATUSES:
            raise ConflictError("任务已结束，不能取消", {"status": task.status})
        task.status = "CANCELLED"
    elif action == "ACCEPT":
        if task.status != "PENDING":
            raise ConflictError("只有待接收任务可接收", {"status": task.status})
        task.status = "ACCEPTED"
        task.assignee = assignee or actor
    elif action == "START":
        if task.status not in ("PENDING", "ACCEPTED"):
            raise ConflictError("任务当前状态不能开始", {"status": task.status})
        task.status = "IN_PROGRESS"
        task.assignee = assignee or task.assignee or actor
    else:
        raise AppError("BAD_TASK_ACTION", f"未知任务动作: {action}", 422)
    _trace(db, task.task_id, task.event_id, actor, f"task.{action.lower()}",
           [], [task.task_id], None)
    db.flush()
    return task


def submit_result(
    db: Session,
    task_id: str,
    *,
    observation_note: str,
    conclusion: str,
    attachment_ids: list[str] | None = None,
    observed_at: datetime | None = None,
    actor: str,
) -> object:
    """现场回填：写入结果 → MANUAL 证据 → 触发事件再评估。"""
    from app.models.workflow import RunTrace
    from app.services import assessment_service, evidence_service

    task = get_task(db, task_id)
    if task.status not in ("IN_PROGRESS", "ACCEPTED"):
        raise ConflictError("任务需先开始/接收才能提交结果", {"status": task.status})

    now = datetime.now(timezone.utc)
    task.result_note = observation_note
    task.result_conclusion = conclusion
    task.attachment_ids = json.dumps(attachment_ids or [], ensure_ascii=False)
    task.observed_at = _utc(observed_at) if observed_at else now
    task.completed_at = now
    task.status = "SUBMITTED"

    # 关联附件到本任务结果，便于按任务回显照片
    if attachment_ids:
        from app.models.observation import Attachment as AttModel
        for att in db.query(AttModel).filter(AttModel.attachment_id.in_(attachment_ids)).all():
            att.related_type = "task_result"
            att.related_id = task.task_id

    evidence_id = None
    if task.event_id:
        polarity = {
            "NORMAL": "COUNTER",      # 现场确认正常 → 对“异常持续”假设构成反证
            "ABNORMAL": "SUPPORT",    # 现场确认异常 → 支持
            "UNCERTAIN": "MISSING",
        }.get(conclusion, "MISSING")
        ev = evidence_service.add_evidence(
            db, task.event_id,
            type="MANUAL", source_ref=task.task_id, polarity=polarity,
            note=f"巡检回填（{task.reach_id}）：{observation_note}",
            quality_flag="GOOD", created_by=actor,
            observed_at=task.observed_at,
        )
        evidence_id = ev.evidence_id
        # 关联到事件当前所有传播假设（人工结论参与假设状态）
        _link_manual_evidence(db, task.event_id, ev.evidence_id, polarity)
        # 再评估版本
        from app.models.event import EventScope
        scope = json.loads(db.execute(
            select(EventScope.reaches_json)
            .where(EventScope.event_id == task.event_id)
            .order_by(EventScope.version.desc()).limit(1)
        ).scalar_one_or_none() or "[]")
        assessment_service.create_assessment(
            db, task.event_id, scope, scope,
            reason=f"巡检任务 {task.task_id} 回填，结论={conclusion}",
            trigger_reason="task.result_submitted",
        )

    db.add(RunTrace(
        trace_id=f"trc-{uuid.uuid4().hex[:16]}",
        event_id=task.event_id, task_id=task.task_id,
        actor=actor, action="task.submitted",
        input_refs=json.dumps(attachment_ids or []),
        output_refs=json.dumps([evidence_id] if evidence_id else []),
        rule_version="manual", detail=observation_note[:300],
    ))
    db.flush()
    return task


def _link_manual_evidence(db: Session, event_id: str, evidence_id: str, polarity: str) -> None:
    from app.models.evidence import Hypothesis
    hyps = db.execute(
        select(Hypothesis).where(Hypothesis.event_id == event_id)
    ).scalars()
    for h in hyps:
        support = set(json.loads(h.support_refs or "[]"))
        counter = set(json.loads(h.counter_refs or "[]"))
        if polarity == "SUPPORT":
            support.add(evidence_id)
        elif polarity == "COUNTER":
            counter.add(evidence_id)
        else:
            continue
        h.support_refs = json.dumps(sorted(support), ensure_ascii=False)
        h.counter_refs = json.dumps(sorted(counter), ensure_ascii=False)
        h.state = _hyp_state(len(support), len(counter))


def _hyp_state(s: int, c: int) -> str:
    if s and not c:
        return "SUPPORT" if s >= 2 else "PARTIAL_SUPPORT"
    if c and not s:
        return "NOT_SUPPORT"
    if s and c:
        return "PARTIAL_SUPPORT"
    return "OPEN"


def _trace(db, task_id, event_id, actor, action, inputs, outputs, detail):
    from app.models.workflow import RunTrace
    db.add(RunTrace(
        trace_id=f"trc-{uuid.uuid4().hex[:16]}",
        event_id=event_id, task_id=task_id, actor=actor, action=action,
        input_refs=json.dumps(inputs), output_refs=json.dumps(outputs),
        rule_version="manual", detail=detail,
    ))
