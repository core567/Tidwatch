"""E 阶段：任务 7 态、版本化提交、PC 复核退回（隔离内存库）。"""
from __future__ import annotations

import pytest

from app.core.errors import AppError, ConflictError
from app.db.session import SessionLocal
from app.models.event import ActiveEvent
from app.models.workflow import InspectionTask, TaskReview, TaskSubmission
from app.services import task_service


@pytest.fixture()
def db(client, clean_event_tables):
    # client 触发表创建；clean_event_tables 保证任务/提交/复核表隔离
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


def _make_task(db, *, draft=False, event_id=None):
    return task_service.create_task(
        db, event_id=event_id, focus_id=None, reach_id="reach-a",
        action_type="MANUAL_CHECK", title="现场核查", created_by="u-admin", draft=draft,
    )


def _to_submitted(db, task):
    task_service.act_task(db, task.task_id, "DISPATCH" if task.status == "DRAFT" else "ACCEPT",
                          actor="u-admin")
    task_service.act_task(db, task.task_id, "START", actor="u-inspector")
    task_service.submit_result(
        db, task.task_id, observation_note="v1 现场正常",
        conclusion="NORMAL", attachment_ids=["att-1"], actor="u-inspector",
    )
    db.flush()
    return task


def test_draft_dispatch_then_old_flow(db):
    t = _make_task(db, draft=True)
    assert t.status == "DRAFT"
    # 草稿可编辑
    task_service.update_draft(db, t.task_id, actor="u-admin", title="改后的标题")
    assert t.title == "改后的标题"
    # 非草稿不能编辑
    task_service.act_task(db, t.task_id, "DISPATCH", actor="u-admin")
    assert t.status == "PENDING"
    with pytest.raises(ConflictError):
        task_service.update_draft(db, t.task_id, actor="u-admin", title="x")


def test_submit_creates_version_and_keeps_snapshot(db):
    t = _make_task(db)
    _to_submitted(db, t)
    db.refresh(t)
    assert t.status == "SUBMITTED"
    subs = task_service.list_submissions(db, t.task_id)
    assert [s.version for s in subs] == [1]
    assert subs[0].attachment_ids_json == '["att-1"]'
    assert t.result_note == "v1 现场正常"  # 旧快照字段仍写


def test_reject_requires_comment_and_reopens_for_resubmit_v2(db):
    t = _make_task(db)
    _to_submitted(db, t)
    # 无原因 → 422
    with pytest.raises(AppError):
        task_service.review_task(db, t.task_id, decision="REJECT", actor="u-admin", comment="")
    # 退回
    task_service.review_task(db, t.task_id, decision="REJECT", actor="u-admin", comment="照片不清晰")
    db.refresh(t)
    assert t.status == "IN_PROGRESS"
    v1 = task_service.list_submissions(db, t.task_id)[0]
    assert v1.superseded_at is not None  # 旧版本归档
    # 重新提交 → v2，历史不覆盖
    task_service.submit_result(
        db, t.task_id, observation_note="v2 补拍", conclusion="ABNORMAL",
        attachment_ids=["att-2"], actor="u-inspector",
    )
    db.flush()
    subs = task_service.list_submissions(db, t.task_id)
    assert [s.version for s in subs] == [1, 2]
    assert subs[0].attachment_ids_json == '["att-1"]'
    assert subs[1].attachment_ids_json == '["att-2"]'
    # 复核记录
    reviews = task_service.list_reviews(db, t.task_id)
    assert reviews[0].decision == "REJECTED" and reviews[0].comment == "照片不清晰"


def test_approve_is_terminal_and_rejects_further_actions(db):
    t = _make_task(db)
    _to_submitted(db, t)
    task_service.review_task(db, t.task_id, decision="APPROVE", actor="u-admin", comment="通过")
    db.refresh(t)
    assert t.status == "APPROVED"
    for act in ("ACCEPT", "START", "CANCEL", "APPROVE", "REJECT"):
        with pytest.raises((ConflictError, AppError)):
            task_service.act_task(db, t.task_id, act, actor="u-admin", comment="x")
    # 终态也不能再提交
    with pytest.raises(ConflictError):
        task_service.submit_result(db, t.task_id, observation_note="x",
                                   conclusion="NORMAL", actor="u-inspector")


def test_submitted_only_reviewable_and_double_review_conflict(db):
    t = _make_task(db)
    _to_submitted(db, t)
    task_service.review_task(db, t.task_id, decision="APPROVE", actor="u-admin")
    db.refresh(t)
    # 已 APPROVED 不能再次复核
    with pytest.raises(ConflictError):
        task_service.review_task(db, t.task_id, decision="REJECT", actor="u-admin", comment="x")


def test_submit_when_not_in_progress_conflicts(db):
    t = _make_task(db)  # PENDING 未开始
    with pytest.raises(ConflictError):
        task_service.submit_result(db, t.task_id, observation_note="x",
                                   conclusion="NORMAL", actor="u-inspector")
    # SUBMITTED 未复核不能重复提交
    _to_submitted(db, t)
    with pytest.raises(ConflictError):
        task_service.submit_result(db, t.task_id, observation_note="dup",
                                   conclusion="NORMAL", actor="u-inspector")


def test_draft_hidden_from_default_list_but_included(db):
    _make_task(db, draft=True)
    _make_task(db, draft=False)
    default = task_service.list_tasks(db)
    assert all(t.status != "DRAFT" for t in default)
    assert len(default) == 1
    with_drafts = task_service.list_tasks(db, include_drafts=True)
    assert {t.status for t in with_drafts} == {"DRAFT", "PENDING"}


def _api_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_api_old_flow_compatible_and_new_endpoints(client, token, clean_event_tables):
    """旧接口端到端仍走通；新端点返回版本/复核。"""
    h = _api_headers(token)
    # 旧建任务（无 draft）→ PENDING
    r = client.post("/api/inspection-tasks", json={"reachId": "reach-a", "title": "旧流程"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "PENDING"
    tid = r.json()["taskId"]
    # 旧动作
    client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "ACCEPT"}, headers=h)
    client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "START"}, headers=h)
    client.post(f"/api/inspection-tasks/{tid}/results",
                json={"observationNote": "回填", "conclusion": "NORMAL"}, headers=h)
    detail = client.get(f"/api/inspection-tasks/{tid}", headers=h).json()
    assert detail["status"] == "SUBMITTED" and detail["latestVersion"] == 1
    subs = client.get(f"/api/inspection-tasks/{tid}/submissions", headers=h).json()
    assert [s["version"] for s in subs] == [1]
    # 批准
    client.post(f"/api/inspection-tasks/{tid}/actions",
                json={"action": "APPROVE", "comment": "ok"}, headers=h)
    assert client.get(f"/api/inspection-tasks/{tid}", headers=h).json()["status"] == "APPROVED"
    reviews = client.get(f"/api/inspection-tasks/{tid}/reviews", headers=h).json()
    assert reviews[0]["decision"] == "APPROVED"


def test_api_draft_hidden_then_dispatched(client, token, clean_event_tables):
    h = _api_headers(token)
    r = client.post("/api/inspection-tasks",
                    json={"reachId": "reach-a", "title": "草稿任务", "draft": True}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "DRAFT" and r.json()["draft"] is True
    tid = r.json()["taskId"]
    # 小程序/默认列表不含草稿
    assert all(x["taskId"] != tid for x in client.get("/api/inspection-tasks", headers=h).json()["items"])
    # PC includeDrafts 可见
    assert any(x["taskId"] == tid for x in
               client.get("/api/inspection-tasks?includeDrafts=true", headers=h).json()["items"])
    # 派发
    assert client.post(f"/api/inspection-tasks/{tid}/actions",
                       json={"action": "DISPATCH"}, headers=h).json()["status"] == "PENDING"


def test_api_reject_empty_comment_422(client, token, clean_event_tables):
    h = _api_headers(token)
    tid = client.post("/api/inspection-tasks", json={"reachId": "reach-a", "title": "任务x"}, headers=h).json()["taskId"]
    client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "ACCEPT"}, headers=h)
    client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "START"}, headers=h)
    client.post(f"/api/inspection-tasks/{tid}/results",
                json={"observationNote": "x", "conclusion": "NORMAL"}, headers=h)
    r = client.post(f"/api/inspection-tasks/{tid}/actions",
                    json={"action": "REJECT", "comment": "  "}, headers=h)
    assert r.status_code == 422
