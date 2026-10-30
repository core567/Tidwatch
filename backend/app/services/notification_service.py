"""站内通知服务（V2.2）：仅追加创建 + 只读查询 + 标记已读。

设计：
- create_review_notification 由 PC 复核在同一 DB 事务内调用，每次复核一条；
- 幂等键 (review_id)：接口重试 / WS 重连 / 页面刷新不会重复创建；
- 接收人取任务 assignee，缺失时回退创建者，保证演示免登录链路也能收到；
- 查询强制按 recipient_id 过滤，不把他人通知广播出去。
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.notification import Notification

TITLE_APPROVED = "巡检任务复核通过"
TITLE_REJECTED = "巡检任务已退回"


def _nid() -> str:
    return f"ntf-{uuid.uuid4().hex[:24]}"


def create_review_notification(
    db: Session,
    *,
    task,
    review,
    submission,
) -> Notification:
    """在复核事务内创建唯一一条复核通知；同一 review_id 已存在则直接返回（幂等）。"""
    existing = db.execute(
        select(Notification).where(Notification.review_id == review.review_id)
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    approved = review.decision == "APPROVED"
    ntype = "TASK_APPROVED" if approved else "TASK_REJECTED"
    title = TITLE_APPROVED if approved else TITLE_REJECTED
    if approved:
        body = f"{task.title}：PC 已复核通过（v{review.version}），任务完成。"
    else:
        comment = review.comment.strip() or "请按复核意见补充后重新提交"
        body = f"{task.title}：{comment}"

    # 接收人：任务负责人；未指派时回退创建者（演示链路兜底），不用空接收人
    recipient = task.assignee or "u-admin"

    ntf = Notification(
        notification_id=_nid(),
        type=ntype,
        title=title,
        body=body,
        task_id=task.task_id,
        submission_id=submission.submission_id if submission else None,
        version=review.version,
        review_id=review.review_id,
        recipient_id=recipient,
        created_by=review.reviewer,
        is_read=False,
    )
    db.add(ntf)
    db.flush()
    return ntf


def list_notifications(db: Session, recipient_id: str, *, unread_only: bool = False,
                       limit: int = 50) -> list[Notification]:
    stmt = select(Notification).where(Notification.recipient_id == recipient_id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(max(1, min(limit, 200)))
    return list(db.execute(stmt).scalars())


def unread_count(db: Session, recipient_id: str) -> int:
    return int(db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.recipient_id == recipient_id, Notification.is_read.is_(False))
    ).scalar_one())


def mark_read(db: Session, recipient_id: str, *, notification_id: str | None = None,
              task_id: str | None = None) -> int:
    """标记已读，返回受影响行数；仅能标记自己的通知。

    - 传 notification_id：单条已读（点通知进详情时按任务批量已读亦可）。
    - 传 task_id：该任务下自己的全部未读已读（进入任务详情时调用）。
    """
    stmt = select(Notification).where(
        Notification.recipient_id == recipient_id, Notification.is_read.is_(False)
    )
    if notification_id:
        stmt = stmt.where(Notification.notification_id == notification_id)
    if task_id:
        stmt = stmt.where(Notification.task_id == task_id)
    rows = list(db.execute(stmt).scalars())
    for r in rows:
        r.is_read = True
    db.flush()
    return len(rows)
