"""H1 AI 助手：规则模式（无 API）真实业务工具问答。"""
from __future__ import annotations

from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.ai import service, rules
from app.ai.tools import REGISTRY
from app.models.event import ActiveEvent, EventScope
from app.models.observation import Observation
from app.models.workflow import InspectionTask
import json
import pytest

T0 = datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _cleanup_ai_seed():
    """AI 测试自建事件，结束后清理，避免污染共享内存库的事件总数断言。"""
    yield
    db = SessionLocal()
    try:
        ids = [f"TW-{t}" for t in ("101", "102", "103", "104")]
        tids = ["tsk-101", "tsk-102", "tsk-103", "tsk-104"]
        db.query(Observation).filter(Observation.source_name == "S", Observation.reach_id == "reach-a").delete()
        db.query(InspectionTask).filter(InspectionTask.task_id.in_(tids)).delete(synchronize_session=False)
        db.query(EventScope).filter(EventScope.event_id.in_(ids)).delete(synchronize_session=False)
        db.query(ActiveEvent).filter(ActiveEvent.event_id.in_(ids)).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _obs_id():
    import uuid
    return f"obs-{uuid.uuid4().hex[:10]}"


def _seed(tag: str = "AI"):
    eid = f"TW-{tag}"
    tid = f"tsk-{tag.lower()}"
    db = SessionLocal()
    if db.get(ActiveEvent, eid):
        db.close()
        return db
    db.add(ActiveEvent(event_id=eid, title="AI 测试事件", event_type="FLOOD",
                       status="INVESTIGATING", priority="HIGH", first_seen_at=T0,
                       version=1, rule_version="demo-rules-v1"))
    db.add(EventScope(event_id=eid, version=1, reaches_json='["reach-a"]'))
    db.add(InspectionTask(task_id=tid, event_id=eid, reach_id="reach-a",
                          action_type="MANUAL_CHECK", title="现场核查", status="PENDING",
                          created_at=T0))
    for i, v in enumerate([4.2, 4.3, 8.9]):
        db.add(Observation(
            observation_id=_obs_id(), reach_id="reach-a", metric="waterLevel",
            value=v, unit="m", observed_at=T0.replace(hour=8 + i), ingested_at=T0.replace(hour=8 + i),
            source_type="SIMULATED", source_name="S", scenario_id="S2",
            quality_flag="GOOD", rule_version="x",
            message_id=_obs_id(), dedup_key=_obs_id(),
        ))
    db.commit()
    return db


def test_registry_tools_readonly_and_present():
    names = set(REGISTRY)
    assert {"reach_latest", "list_events", "event_detail", "list_tasks",
            "recovery_assessment", "anomalies"} <= names


def test_rule_mode_reach_latest(client, token):
    db = _seed("101")
    try:
        r = client.post("/api/ai/chat", headers={"Authorization": f"Bearer {token}"},
                        json={"message": "上游A当前水位是多少"})
        assert r.status_code == 200
        body = r.json()
        assert body["mode"] == "rule"
        assert "reach_latest" in body["toolsUsed"]
        assert "水位" in body["answer"]
        assert body["model"] is None
    finally:
        db.close()


def test_rule_mode_events_tasks_and_status(client, token):
    db = _seed("102")
    try:
        r = client.post("/api/ai/chat", headers={"Authorization": f"Bearer {token}"},
                        json={"message": "当前有哪些未处理任务"})
        assert r.status_code == 200
        b = r.json()
        assert "list_tasks" in b["toolsUsed"] and "tsk-102" in b["answer"]

        r = client.post("/api/ai/chat", headers={"Authorization": f"Bearer {token}"},
                        json={"message": "TW-102 事件状态"})
        b = r.json()
        assert "event_detail" in b["toolsUsed"] and "INVESTIGATING" in b["answer"]
    finally:
        db.close()


def test_rule_mode_recovery_uses_rule_tool(client, token):
    db = _seed("103")
    try:
        r = client.post("/api/ai/chat", headers={"Authorization": f"Bearer {token}"},
                        json={"message": "TW-103 恢复评估结果如何"})
        b = r.json()
        assert "recovery_assessment" in b["toolsUsed"]
        assert any(k in b["answer"] for k in ("证据不足", "仍需观察", "支持恢复"))
    finally:
        db.close()


def test_write_intent_not_executed(client, token):
    r = client.post("/api/ai/chat", headers={"Authorization": f"Bearer {token}"},
                    json={"message": "帮我派发一个任务"})
    b = r.json()
    assert b["toolsUsed"] == []
    assert "人工确认" in b["answer"] or "不能" in b["answer"]


def test_status_endpoint_reports_rule_mode_when_unconfigured(client, token, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.settings, "ai_enabled", False)
    r = client.get("/api/ai/status", headers={"Authorization": f"Bearer {token}"})
    b = r.json()
    assert b["configured"] is False and b["mode"] == "rule"


def test_unknown_question_marks_basic_mode(client, token, monkeypatch):
    # 该用例验证“未配置大模型”时的兜底，强制关闭以与运行环境解耦
    from app.core import config
    monkeypatch.setattr(config.settings, "ai_enabled", False, raising=False)
    monkeypatch.setattr(config.settings, "ai_api_key", "", raising=False)
    r = client.post("/api/ai/chat", headers={"Authorization": f"Bearer {token}"},
                    json={"message": "宇宙的尽头是什么"})
    b = r.json()
    assert b["mode"] == "rule"
    assert any("基础助手模式" in w for w in b["warnings"])


def test_anomalies_tool(client, token):
    db = _seed("104")
    try:
        r = client.post("/api/ai/chat", headers={"Authorization": f"Bearer {token}"},
                        json={"message": "哪些断面存在异常"})
        b = r.json()
        assert "anomalies" in b["toolsUsed"]
    finally:
        db.close()
