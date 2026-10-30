"""站内通知路由（V2.2）：小程序现场端拉取通知 / 未读数 / 标记已读。

接收人一律取当前登录用户 user_id（演示免登录为 u-admin），
所有查询强制按接收人过滤，不提供全量广播读取。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.system import User
from app.services import notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    notificationId: str
    type: str
    title: str
    body: str
    taskId: str
    submissionId: str | None = None
    version: int = 0
    reviewId: str | None = None
    isRead: bool
    createdAt: str | None = None


def _to_out(n) -> NotificationOut:
    return NotificationOut(
        notificationId=n.notification_id,
        type=n.type,
        title=n.title,
        body=n.body,
        taskId=n.task_id,
        submissionId=n.submission_id,
        version=n.version,
        reviewId=n.review_id,
        isRead=bool(n.is_read),
        createdAt=n.created_at.isoformat() if n.created_at else None,
    )


@router.get("")
def list_notifications(
    unreadOnly: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = notification_service.list_notifications(
        db, user.user_id, unread_only=unreadOnly, limit=limit
    )
    return {"items": [_to_out(n) for n in rows]}


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"unread": notification_service.unread_count(db, user.user_id)}


class MarkReadIn(BaseModel):
    notificationId: str | None = None
    taskId: str | None = None


@router.post("/mark-read")
def mark_read(
    body: MarkReadIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.notificationId and not body.taskId:
        return {"updated": 0}
    updated = notification_service.mark_read(
        db, user.user_id,
        notification_id=body.notificationId, task_id=body.taskId,
    )
    db.commit()
    return {"updated": updated, "unread": notification_service.unread_count(db, user.user_id)}
