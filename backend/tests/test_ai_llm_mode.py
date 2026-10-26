"""H1 大模型模式：模拟 OpenAI 兼容响应验证工具调用循环与降级（不访问真实 API）。"""
from __future__ import annotations

from datetime import datetime, timezone

from app.ai import llm, service
from app.ai.llm import LLMError
from app.db.session import SessionLocal
from app.models.event import ActiveEvent, EventScope
from app.models.observation import Observation
import uuid
import pytest


@pytest.fixture(autouse=True)
def _cleanup_llm_seed():
    yield
    db = SessionLocal()
    try:
        db.query(Observation).filter(Observation.source_name == "S", Observation.reach_id == "reach-a").delete()
        db.query(EventScope).filter(EventScope.event_id == "TW-201").delete(synchronize_session=False)
        db.query(ActiveEvent).filter(ActiveEvent.event_id == "TW-201").delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

T0 = datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc)


def _oid():
    return f"obs-{uuid.uuid4().hex[:10]}"


def _seed():
    db = SessionLocal()
    if not db.get(ActiveEvent, "TW-201"):
        db.add(ActiveEvent(event_id="TW-201", title="LLM 事件", event_type="FLOOD",
                           status="INVESTIGATING", priority="HIGH", first_seen_at=T0,
                           version=1, rule_version="demo-rules-v1"))
        db.add(EventScope(event_id="TW-201", version=1, reaches_json='["reach-a"]'))
        db.add(Observation(
            observation_id=_oid(), reach_id="reach-a", metric="waterLevel", value=9.1, unit="m",
            observed_at=T0, ingested_at=T0, source_type="SIMULATED", source_name="S",
            scenario_id="S2", quality_flag="GOOD", rule_version="x",
            message_id=_oid(), dedup_key=_oid(),
        ))
        db.commit()
    return db


def _msg(content=None, tool_calls=None):
    m = {"role": "assistant", "content": content}
    if tool_calls:
        m["tool_calls"] = tool_calls
    return m


def _resp(message):
    return {"choices": [{"message": message}], "model": "mock-model"}


def test_llm_tool_call_loop(client, monkeypatch):
    db = _seed()
    calls = {"n": 0}

    def fake_post(payload):
        calls["n"] += 1
        if calls["n"] == 1:
            # 模型请求 reach_latest
            return _resp(_msg(tool_calls=[{
                "id": "c1",
                "function": {"name": "reach_latest", "arguments": '{"reachId":"reach-a"}'},
            }]))
        # 第二次给最终回答
        return _resp(_msg(content="上游 A 当前水位 9.1m，超过警戒。"))

    monkeypatch.setattr(llm, "_post_chat", fake_post)
    out = llm.chat(db, "上游水位多少")
    assert out["answer"].startswith("上游 A")
    assert "reach_latest" in out["toolsUsed"]
    assert out["model"] == "mock-model"
    db.close()


def test_llm_rejects_unregistered_tool(client, monkeypatch):
    db = _seed()
    calls = {"n": 0}

    def fake_post(payload):
        calls["n"] += 1
        if calls["n"] == 1:
            return _resp(_msg(tool_calls=[{
                "id": "c1",
                "function": {"name": "drop_database", "arguments": "{}"},
            }]))
        return _resp(_msg(content="我无法执行未授权操作。"))

    monkeypatch.setattr(llm, "_post_chat", fake_post)
    out = llm.chat(db, "执行危险操作")
    joined = str(out["toolResults"])
    assert "未授权" in joined
    assert out["answer"].startswith("我无法")
    db.close()


def test_llm_bad_arguments_validated(client, monkeypatch):
    db = _seed()
    calls = {"n": 0}

    def fake_post(payload):
        calls["n"] += 1
        if calls["n"] == 1:
            # 缺少 reachId
            return _resp(_msg(tool_calls=[{
                "id": "c1",
                "function": {"name": "reach_latest", "arguments": "{}"},
            }]))
        return _resp(_msg(content="缺少断面信息。"))

    monkeypatch.setattr(llm, "_post_chat", fake_post)
    out = llm.chat(db, "查水位")
    assert any(r.get("error") for r in out["toolResults"])
    db.close()


def test_service_falls_back_to_rule_on_llm_error(client, monkeypatch):
    db = _seed()
    # 配置为已启用
    from app.core import config
    monkeypatch.setattr(config.settings, "ai_enabled", True, raising=False)
    monkeypatch.setattr(config.settings, "ai_api_key", "k", raising=False)
    monkeypatch.setattr(config.settings, "ai_base_url", "http://x", raising=False)
    monkeypatch.setattr(config.settings, "ai_model", "m", raising=False)
    assert config.settings.ai_configured is True

    def boom(_payload):
        raise LLMError("连接超时")
    monkeypatch.setattr(llm, "_post_chat", boom)

    out = service.respond(db, "请深入分析这段模糊的语义并给出研判")
    assert out["mode"] == "rule"
    assert out["degraded"] is True
    assert "基础助手模式" in out["answer"]
    db.close()


def test_status_reports_llm_when_configured(client, token, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.settings, "ai_enabled", True, raising=False)
    monkeypatch.setattr(config.settings, "ai_api_key", "k", raising=False)
    monkeypatch.setattr(config.settings, "ai_base_url", "http://x", raising=False)
    monkeypatch.setattr(config.settings, "ai_model", "m", raising=False)
    r = client.get("/api/ai/status", headers={"Authorization": f"Bearer {token}"})
    b = r.json()
    assert b["configured"] is True and b["mode"] == "llm" and b["model"] == "m"
