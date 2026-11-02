"""F6 完整任务闭环隔离测试（内存 sqlite，不碰正式库）：
派发 → 接收 → 执行 → 现场反馈 V1 → 退回（需原因）→ 现场反馈 V2 → 复核通过。
核对版本号、复核记录（REJECTED/APPROVED）与业务时间线。
"""
from app.models.workflow import TaskReview, TaskSubmission


def test_full_task_lifecycle_dispatch_to_approved(client, token):
    h = {"Authorization": f"Bearer {token}"}

    # 1) 派发（正式任务 PENDING）
    r = client.post(
        "/api/inspection-tasks",
        json={"reachId": "reach-a", "title": "F6 闭环测试任务", "actionType": "MANUAL_CHECK"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    tid = r.json()["taskId"]
    assert r.json()["status"] == "PENDING"

    # 2) 接收
    assert client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "ACCEPT"}, headers=h).status_code == 200
    # 3) 执行
    assert client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "START"}, headers=h).status_code == 200

    # 4) 现场反馈 V1
    r = client.post(
        f"/api/inspection-tasks/{tid}/results",
        json={
            "observationNote": "V1 现场反馈",
            "conclusion": "ABNORMAL",
            "observedAt": "2026-10-25T10:00:00",
            "attachmentIds": [],
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SUBMITTED"
    assert r.json()["latestVersion"] == 1

    # 5) 退回必须有原因
    bad = client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "REJECT"}, headers=h)
    assert bad.status_code == 422
    # 正常退回 → 回到执行中
    rj = client.post(
        f"/api/inspection-tasks/{tid}/actions",
        json={"action": "REJECT", "comment": "照片不足，请补充"},
        headers=h,
    )
    assert rj.status_code == 200, rj.text
    assert rj.json()["status"] == "IN_PROGRESS"

    # 6) 现场反馈 V2
    r2 = client.post(
        f"/api/inspection-tasks/{tid}/results",
        json={
            "observationNote": "V2 已补充照片与测量",
            "conclusion": "NORMAL",
            "observedAt": "2026-10-25T11:00:00",
            "attachmentIds": [],
        },
        headers=h,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["latestVersion"] == 2
    assert r2.json()["status"] == "SUBMITTED"

    # 7) 复核通过（终态）
    ap = client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "APPROVE"}, headers=h)
    assert ap.status_code == 200, ap.text
    assert ap.json()["status"] == "APPROVED"
    # 终态不能再取消
    assert client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "CANCEL"}, headers=h).status_code == 409

    # 版本与复核记录
    subs = client.get(f"/api/inspection-tasks/{tid}/submissions", headers=h).json()
    assert len(subs) == 2
    assert [s["version"] for s in subs] == [1, 2]
    v1, v2r = subs
    assert v1["supersededAt"] is not None  # V1 被退回后归档
    assert v2r["supersededAt"] is None

    reviews = client.get(f"/api/inspection-tasks/{tid}/reviews", headers=h).json()
    decisions = [(x["version"], x["decision"]) for x in reviews]
    assert (1, "REJECTED") in decisions
    assert (2, "APPROVED") in decisions

    # 业务时间线包含完整链路
    from app.db.session import SessionLocal
    db = SessionLocal()
    from app.services import timeline_service
    biz = timeline_service.list_for_task(db, tid)
    types = {i['actionType'] for i in biz}
    assert {"task.accepted", "task.started", "task.submitted", "task.rejected", "task.approved"} <= types
    db.close()


def test_draft_then_dispatch(client, token):
    """草稿（DRAFT）→ 正式派发（PENDING）语义正确"""
    h = {"Authorization": f"Bearer {token}"}
    r = client.post(
        "/api/inspection-tasks",
        json={"reachId": "reach-b", "title": "草稿任务", "draft": True},
        headers=h,
    )
    assert r.status_code == 200, r.text
    tid = r.json()["taskId"]
    assert r.json()["status"] == "DRAFT"
    # 默认列表不含草稿
    assert client.get("/api/inspection-tasks", headers=h).json()["total"] >= 1
    # 派发
    d = client.post(f"/api/inspection-tasks/{tid}/actions", json={"action": "DISPATCH"}, headers=h)
    assert d.status_code == 200
    assert d.json()["status"] == "PENDING"
