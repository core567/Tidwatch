"""V2.2：PC 复核 → 站内通知（生成、幂等、接收人过滤、API 端到端）。隔离内存库。"""
from __future__ import annotations

import pytest

from app.db.session import SessionLocal
from app.models.notification import Notification
from app.services import notification_service, task_service


@pytest.fixture()
def db(client, clean_event_tables):
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


def _to_submitted(db):
    t = task_service.create_task(
        db, event_id=None, focus_id=None, reach_id="reach-a",
        action_type="MANUAL_CHECK", title="现场核查任务", created_by="u-admin",
    )
    # 指派给现场人员，通知接收人应为 assignee
    task_service.act_task(db, t.task_id, "ACCEPT", actor="u-inspector", assignee="u-inspector")
    task_service.act_task(db, t.task_id, "START", actor="u-inspector")
    task_service.submit_result(
        db, t.task_id, observation_note="v1 正常", conclusion="NORMAL",
        attachment_ids=["att-1"], actor="u-inspector",
    )
    db.flush()
    return t


def test_reject_creates_one_notification_for_assignee(db):
    t = _to_submitted(db)
    task_service.review_task(db, t.task_id, decision="REJECT", actor="u-admin", comment="照片不清晰")
    db.flush()
    notes = notification_service.list_notifications(db, "u-inspector")
    assert len(notes) == 1
    n = notes[0]
    assert n.type == "TASK_REJECTED" and n.title == "巡检任务已退回"
    assert "照片不清晰" in n.body and n.task_id == t.task_id and n.version == 1
    assert n.review_id and n.submission_id and n.is_read is False
    assert notification_service.unread_count(db, "u-inspector") == 1
    # 其他接收人看不到
    assert notification_service.list_notifications(db, "someone-else") == []


def test_approve_notification_and_mark_read(db):
    t = _to_submitted(db)
    task_service.review_task(db, t.task_id, decision="APPROVE", actor="u-admin", comment="通过")
    db.flush()
    notes = notification_service.list_notifications(db, "u-inspector")
    assert len(notes) == 1 and notes[0].type == "TASK_APPROVED"
    # 按任务标记已读
    updated = notification_service.mark_read(db, "u-inspector", task_id=t.task_id)
    assert updated == 1
    assert notification_service.unread_count(db, "u-inspector") == 0
    # 不能标记别人的通知
    assert notification_service.mark_read(db, "x", task_id=t.task_id) == 0


def test_notification_idempotent_same_review(db):
    t = _to_submitted(db)
    task_service.review_task(db, t.task_id, decision="REJECT", actor="u-admin", comment="退回")
    db.flush()
    sub = task_service.latest_submission(db, t.task_id)
    review = task_service.list_reviews(db, t.task_id)[-1]
    # 用同一复核记录重复调用服务应返回同一条，不新增
    again = notification_service.create_review_notification(db, task=t, review=review, submission=sub)
    db.flush()
    cnt = db.query(Notification).filter(Notification.review_id == review.review_id).count()
    assert cnt == 1 and again.review_id == review.review_id


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_api_review_then_notifications_endpoint(client, token, clean_event_tables):
    h = _headers(token)
    tid = client.post("/api/inspection-tasks", json={"reachId": "reach-a", "title": "接口任务"}, headers=h).json()["taskId"]
    client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "ACCEPT"}, headers=h)
    client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "START"}, headers=h)
    client.post(f"/api/inspection-tasks/{tid}/results",
                json={"observationNote": "回填", "conclusion": "NORMAL"}, headers=h)
    # 复核通过（演示免登录接收人为 u-admin）
    r = client.post(f"/api/inspection-tasks/{tid}/actions",
                    json={"action": "APPROVE", "comment": "ok"}, headers=h)
    assert r.status_code == 200
    cnt = client.get("/api/notifications/unread-count", headers=h).json()["unread"]
    assert cnt == 1
    items = client.get("/api/notifications", headers=h).json()["items"]
    assert len(items) == 1 and items[0]["type"] == "TASK_APPROVED" and items[0]["isRead"] is False
    # 进入任务详情 → 按任务已读
    mr = client.post("/api/notifications/mark-read", json={"taskId": tid}, headers=h).json()
    assert mr["updated"] == 1 and mr["unread"] == 0
