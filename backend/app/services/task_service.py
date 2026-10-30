"""巡检任务服务（GRP：观察重点→任务→现场记录→再评估）。

任务由系统（Focus）或人工（PC）派发；小程序端接受→开始→提交结果。
回填结果作为 MANUAL 证据进入事件，并触发一次再评估。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError

TASK_ACTIONS = {"ACCEPT", "START", "CANCEL", "DISPATCH", "APPROVE", "REJECT"}
FINAL_STATUSES = {"APPROVED", "CANCELLED"}
# 仍可被取消的非终态（SUBMITTED 待复核也允许放弃）
CANCELLABLE = {"DRAFT", "PENDING", "ACCEPTED", "IN_PROGRESS", "SUBMITTED"}


def _id() -> str:
    return f"tsk-{uuid.uuid4().hex[:16]}"


def _sub_id() -> str:
    return f"sub-{uuid.uuid4().hex[:20]}"


def _rev_id() -> str:
    return f"rev-{uuid.uuid4().hex[:20]}"


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
    draft: bool = False,
) -> "object":
    from app.models.workflow import InspectionTask

    status = "DRAFT" if draft else "PENDING"
    task = InspectionTask(
        task_id=_id(),
        event_id=event_id,
        focus_id=focus_id,
        reach_id=reach_id,
        action_type=action_type,
        title=title,
        priority=priority,
        status=status,
        due_at=due_at,
        reason=reason,
        assignee=None if draft else assignee,
    )
    db.add(task)
    db.flush()
    action = "task.drafted" if draft else "task.created"
    _trace(db, task.task_id, event_id, created_by, action,
           [reach_id], [task.task_id], reason)
    from app.services import timeline_service
    timeline_service.record(
        db, biz_type=timeline_service.BIZ_TASK, action_type=action,
        event_ref=event_id, task_ref=task.task_id, actor=created_by,
        to_status=status, description=title,
    )
    return task


def update_draft(db: Session, task_id: str, *, actor: str, **fields) -> "object":
    """仅 DRAFT 可编辑标题/优先级/理由/断面/到期。"""
    task = get_task(db, task_id)
    if task.status != "DRAFT":
        raise ConflictError("只有草稿任务可编辑", {"status": task.status})
    allowed = {"title", "priority", "reason", "reach_id", "due_at"}
    for k, v in fields.items():
        if k in allowed and v is not None:
            setattr(task, k, v)
    db.flush()
    _trace(db, task.task_id, task.event_id, actor, "task.draft_updated",
           [], [task.task_id], None)
    return task


def dispatch_task(db: Session, task_id: str, *, actor: str, assignee: str | None = None):
    """DRAFT → PENDING（正式派发，进入现场待办）。"""
    task = get_task(db, task_id)
    if task.status != "DRAFT":
        raise ConflictError("只有草稿任务可派发", {"status": task.status})
    task.status = "PENDING"
    if assignee:
        task.assignee = assignee
    _trace(db, task.task_id, task.event_id, actor, "task.dispatched",
           [task.reach_id], [task.task_id], None)
    from app.services import timeline_service
    timeline_service.record(
        db, biz_type=timeline_service.BIZ_TASK, action_type="task.dispatched",
        event_ref=task.event_id, task_ref=task.task_id, actor=actor,
        from_status="DRAFT", to_status="PENDING",
    )
    db.flush()
    return task


def list_tasks(
    db: Session,
    *,
    status: str | None = None,
    assignee: str | None = None,
    event_id: str | None = None,
    include_drafts: bool = False,
) -> list["object"]:
    from app.models.workflow import InspectionTask

    stmt = select(InspectionTask)
    if status:
        stmt = stmt.where(InspectionTask.status == status)
    else:
        # 显式按 DRAFT 状态查询时仍返回草稿；否则默认对现场端隐藏草稿
        if status != "DRAFT" and not include_drafts:
            stmt = stmt.where(InspectionTask.status != "DRAFT")
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
             assignee: str | None = None, comment: str | None = None):
    task = get_task(db, task_id)
    if action == "DISPATCH":
        return dispatch_task(db, task_id, actor=actor, assignee=assignee)
    if action in ("APPROVE", "REJECT"):
        return review_task(db, task_id, decision=action, actor=actor, comment=comment)
    if action == "CANCEL":
        if task.status in FINAL_STATUSES:
            raise ConflictError("任务已结束，不能取消", {"status": task.status})
        if task.status not in CANCELLABLE:
            raise ConflictError("当前状态不能取消", {"status": task.status})
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
    from app.services import timeline_service
    canon = {"ACCEPT": "task.accepted", "START": "task.started", "CANCEL": "task.cancelled"}
    timeline_service.record(
        db, biz_type=timeline_service.BIZ_TASK,
        action_type=canon[action],
        event_ref=task.event_id, task_ref=task.task_id, actor=actor,
        to_status=task.status,
    )
    db.flush()
    return task


def latest_submission(db: Session, task_id: str):
    from app.models.workflow import TaskSubmission
    return db.execute(
        select(TaskSubmission)
        .where(TaskSubmission.task_id == task_id)
        .order_by(TaskSubmission.version.desc())
        .limit(1)
    ).scalar_one_or_none()


def list_submissions(db: Session, task_id: str) -> list:
    from app.models.workflow import TaskSubmission
    return list(db.execute(
        select(TaskSubmission)
        .where(TaskSubmission.task_id == task_id)
        .order_by(TaskSubmission.version.asc())
    ).scalars())


def list_reviews(db: Session, task_id: str) -> list:
    from app.models.workflow import TaskReview
    return list(db.execute(
        select(TaskReview)
        .where(TaskReview.task_id == task_id)
        .order_by(TaskReview.reviewed_at.asc())
    ).scalars())


def review_task(db: Session, task_id: str, *, decision: str, actor: str,
                comment: str | None = None):
    """PC 复核：APPROVE 通过（→APPROVED 终态）或 REJECT 退回（→IN_PROGRESS，需原因）。"""
    from app.models.workflow import TaskReview
    task = get_task(db, task_id)
    if task.status != "SUBMITTED":
        raise ConflictError("只有待复核任务可复核", {"status": task.status})
    sub = latest_submission(db, task_id)
    if decision == "REJECT":
        if not (comment or "").strip():
            raise AppError("REVIEW_COMMENT_REQUIRED", "退回必须填写原因", 422)
        # 当前版本归档，任务回到执行中，等待重新提交新版本
        if sub is not None:
            sub.superseded_at = datetime.now(timezone.utc)
        task.status = "IN_PROGRESS"
        to_status = "IN_PROGRESS"
        action_type = "task.rejected"
    elif decision == "APPROVE":
        task.status = "APPROVED"
        task.completed_at = datetime.now(timezone.utc)
        to_status = "APPROVED"
        action_type = "task.approved"
    else:
        raise AppError("BAD_REVIEW_DECISION", f"未知复核决定: {decision}", 422)

    review = TaskReview(
        review_id=_rev_id(), task_id=task_id,
        submission_id=sub.submission_id if sub else "",
        version=sub.version if sub else 0,
        decision="REJECTED" if decision == "REJECT" else "APPROVED",
        comment=(comment or "").strip(),
        reviewer=actor,
    )
    db.add(review)
    _trace(db, task_id, task.event_id, actor,
           "task.approved" if decision == "APPROVE" else "task.rejected",
           [sub.submission_id if sub else ""], [task.task_id], comment)
    from app.services import timeline_service
    from app.models.audit import BIZ_REVIEW
    timeline_service.record(
        db, biz_type=BIZ_REVIEW, action_type=action_type,
        event_ref=task.event_id, task_ref=task_id, actor=actor,
        from_status="SUBMITTED", to_status=to_status,
        description=(comment or None), review_ref=review.review_id,
        evidence_refs=[sub.submission_id] if sub else [],
    )
    # V2.2：同事务生成唯一一条复核通知（按 review_id 幂等），路由提交后经 hub 实时推送
    from app.services import notification_service
    notification_service.create_review_notification(
        db, task=task, review=review, submission=sub,
    )
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
    measurements: list | None = None,
) -> object:
    """现场回填：新增一个提交版本 → MANUAL 证据 → 触发事件再评估。

    旧行为兼容：仍把最新结果快照写在任务行（TaskOut 字段不变）；
    新增：每次提交在 task_submissions 留版本，照片挂到具体 submission。
    """
    from app.models.workflow import RunTrace, TaskSubmission
    from app.services import assessment_service, evidence_service

    task = get_task(db, task_id)
    if task.status not in ("IN_PROGRESS", "ACCEPTED"):
        raise ConflictError("任务需先开始/接收才能提交结果", {"status": task.status})

    now = datetime.now(timezone.utc)
    observed = _utc(observed_at) if observed_at else now

    # 新版本号（max(version)+1），唯一约束兜底并发
    current_max = db.execute(
        select(func.max(TaskSubmission.version))
        .where(TaskSubmission.task_id == task_id)
    ).scalar() or 0
    version = int(current_max) + 1
    sub = TaskSubmission(
        submission_id=_sub_id(),
        task_id=task_id,
        version=version,
        observation_note=observation_note,
        conclusion=conclusion,
        measurements_json=json.dumps(measurements or [], ensure_ascii=False),
        observed_at=observed,
        attachment_ids_json=json.dumps(attachment_ids or [], ensure_ascii=False),
        submitted_by=actor,
        submitted_at=now,
    )
    db.add(sub)
    db.flush()

    # 任务行保留最新快照（旧读模型/小程序 TaskOut 不变）
    task.result_note = observation_note
    task.result_conclusion = conclusion
    task.attachment_ids = json.dumps(attachment_ids or [], ensure_ascii=False)
    task.observed_at = observed
    task.completed_at = now
    task.status = "SUBMITTED"

    # 附件同时挂到具体 submission（新版本）与任务（旧快照明细），互不覆盖
    if attachment_ids:
        from app.models.observation import Attachment as AttModel
        for att in db.query(AttModel).filter(AttModel.attachment_id.in_(attachment_ids)).all():
            att.related_type = "submission"
            att.related_id = sub.submission_id

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
        output_refs=json.dumps([sub.submission_id, *([evidence_id] if evidence_id else [])]),
        rule_version="manual", detail=f"v{version} {observation_note[:280]}",
    ))
    from app.services import timeline_service
    timeline_service.record(
        db, biz_type=timeline_service.BIZ_TASK, action_type="task.submitted",
        event_ref=task.event_id, task_ref=task.task_id,
        submission_ref=sub.submission_id, actor=actor,
        to_status="SUBMITTED",
        description=f"v{version} 现场回填（{conclusion}）：{observation_note}"[:500],
        evidence_refs=[*(attachment_ids or []), *( [evidence_id] if evidence_id else [])],
        occurred_at=task.observed_at or now,
    )
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
