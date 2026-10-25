"""C 阶段：统一时间线 business_events、backfill、处置建议、allowed_actions。"""
from __future__ import annotations

import pytest

from app.db.session import SessionLocal
from app.models.audit import BusinessEvent
from app.models.workflow import InspectionTask
from app.rules.recommendations import build_recommendations
from app.rules.state_machine import allowed_actions
from app.services import task_service, timeline_service
from app.services.event_service import EventProcessor

from tests.test_tasks import _seed_event_ab


@pytest.fixture()
def seeded(client, clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    event = _seed_event_ab(db, ep)
    yield db, event
    db.close()


def test_event_transition_writes_business_events(seeded):
    db, event = seeded
    rows = timeline_service.list_for_event(db, event.event_id)
    status_actions = [r["actionType"] for r in rows if r["bizType"] == "EVENT"]
    # 创建时 RULE 自动 OPEN 与 START_INVESTIGATION 两次迁移
    assert status_actions.count("event.status-changed") >= 2
    assert all(r["source"] == "live" for r in rows)
    first = rows[0]
    assert first["toStatus"] in {"OPEN", "INVESTIGATING"}


def test_task_full_flow_timeline(seeded):
    db, event = seeded
    task = task_service.create_task(
        db, event_id=event.event_id, focus_id=None, reach_id="reach-c",
        action_type="MANUAL_CHECK", title="时间线任务", created_by="u-admin",
    )
    task_service.act_task(db, task.task_id, "ACCEPT", actor="u-inspector")
    task_service.act_task(db, task.task_id, "START", actor="u-inspector")
    task_service.submit_result(
        db, task.task_id, observation_note="现场正常",
        conclusion="NORMAL", actor="u-inspector",
    )
    db.commit()

    rows = timeline_service.list_for_task(db, task.task_id)
    task_rows = [r for r in rows if r["bizType"] == "TASK"]
    actions = [r["actionType"] for r in task_rows]
    assert actions == ["task.created", "task.accepted", "task.started", "task.submitted"]
    assert task_rows[-1]["toStatus"] == "SUBMITTED"
    # 提交同时产生证据/评估事件（同一事件时间线可见）
    event_rows = timeline_service.list_for_event(db, event.event_id)
    kinds = {r["actionType"] for r in event_rows}
    assert "evidence.added" in kinds
    assert "assessment.created" in kinds


def test_backfill_idempotent(seeded):
    db, event = seeded
    task = task_service.create_task(
        db, event_id=event.event_id, focus_id=None, reach_id="reach-c",
        action_type="MANUAL_CHECK", title="回填任务", created_by="u-admin",
    )
    task_service.act_task(db, task.task_id, "ACCEPT", actor="u-inspector")
    db.commit()

    # 清空 live 审计行，仅保留 run_traces / status_transitions
    db.query(BusinessEvent).delete()
    db.commit()

    first = timeline_service.backfill(db)
    db.commit()
    n1 = db.query(BusinessEvent).count()
    assert first["event.status-changed"] >= 2
    assert first["task"] >= 2  # created + accepted

    second = timeline_service.backfill(db)
    db.commit()
    n2 = db.query(BusinessEvent).count()
    assert n2 == n1  # 幂等：第二次全部跳过
    assert second["event.status-changed"] == 0 and second["task"] == 0
    assert all(r.source == "backfill" for r in db.query(BusinessEvent).all())


def test_recommendations_rules():
    # OPEN 且无任务 → 开始研判 + 派发核查
    recs = build_recommendations(status="OPEN", scope_reach_ids=["reach-a"], tasks=[])
    codes = {r["code"] for r in recs}
    assert "START_INVESTIGATION" in codes and "DISPATCH_FIELD_CHECK" in codes

    # 有待复核回填 → 复核优先
    recs = build_recommendations(
        status="INVESTIGATING", scope_reach_ids=["reach-a"],
        tasks=[{"taskId": "t1", "status": "SUBMITTED"}],
    )
    assert recs[0]["code"] == "REVIEW_SUBMISSION"

    # 开放盲区阻断 + 升级缺证据
    recs = build_recommendations(
        status="ESCALATED", scope_reach_ids=["reach-a", "reach-b"],
        tasks=[], open_blindspot_reaches=["reach-b"], has_manual_evidence=False,
    )
    codes = {r["code"] for r in recs}
    assert "RESOLVE_BLINDSPOT" in codes and "ADD_MANUAL_EVIDENCE" in codes

    # 待确认恢复
    recs = build_recommendations(
        status="RECOVERY_PENDING", scope_reach_ids=["reach-a"],
        tasks=[{"taskId": "t1", "status": "APPROVED"}],
    )
    assert any(r.get("eventAction") == "CONFIRM_RECOVERED" for r in recs)


def test_allowed_actions_from_state_machine():
    assert "START_INVESTIGATION" in allowed_actions("OPEN")
    assert "CONFIRM_RECOVERED" not in allowed_actions("OPEN")
    assert "CONFIRM_RECOVERED" in allowed_actions("RECOVERY_PENDING")


def test_timeline_and_recommendations_endpoints(client, token, seeded):
    _, event = seeded
    h = {"Authorization": f"Bearer {token}"}
    r = client.get(f"/api/events/{event.event_id}/timeline", headers=h)
    assert r.status_code == 200, r.text
    assert isinstance(r.json()["items"], list)

    r = client.get(f"/api/events/{event.event_id}/recommendations", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "RULE" and len(body["items"]) >= 1

    detail = client.get(f"/api/events/{event.event_id}", headers=h).json()
    assert "allowedActions" in detail
    assert "START_INVESTIGATION" in detail["allowedActions"] or \
           "ESCALATE" in detail["allowedActions"]
