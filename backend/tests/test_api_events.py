"""/api/events 接口测试：借助事件服务制造事件，验证查询与人工操作。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.db.session import SessionLocal
from app.models.event import ActiveEvent
from app.models.observation import Observation
from app.services.event_service import processor as fresh_processor


T0 = datetime(2026, 10, 22, 6, 0, tzinfo=timezone.utc)


def _make_event(reach="reach-a") -> str:
    """连续两个高水位点产生一个事件，返回 event_id。"""
    db = SessionLocal()
    for i in range(2):
        batch = uuid4().hex[:10]
        ids = []
        for metric, value, unit in (("waterLevel", 9.0 + i * 0.1, "m"), ("turbidity", 20.0, "NTU")):
            oid = f"obs-{uuid4().hex[:12]}"
            db.add(Observation(
                observation_id=oid, reach_id=reach, metric=metric, value=value, unit=unit,
                observed_at=T0 + timedelta(minutes=i), ingested_at=T0 + timedelta(minutes=i),
                source_type="SIMULATED", source_name="scenario-S2", scenario_id="S2",
                quality_flag="GOOD", rule_version="demo-rules-v1",
                message_id=f"S2-{reach}-{batch}-{metric}",
                dedup_key=f"S2-{reach}-{batch}-{metric}",
            ))
            ids.append(oid)
        db.commit()
        fresh_processor.process_sample(
            db, reach, T0 + timedelta(minutes=i), 9.0 + i * 0.1, 20.0, "S2", ids
        )
    event_id = db.query(ActiveEvent).order_by(ActiveEvent.first_seen_at.desc()).first().event_id
    db.close()
    return event_id


def test_events_list_and_detail(client, token):
    event_id = _make_event()
    h = {"Authorization": f"Bearer {token}"}
    resp = client.get("/api/events", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    item = next(x for x in body["items"] if x["eventId"] == event_id)
    assert item["scopeReachIds"] == ["reach-a"]
    assert item["status"] == "INVESTIGATING"

    detail = client.get(f"/api/events/{event_id}", headers=h).json()
    assert detail["changeCount"] >= 1
    # 自动 OPEN→INVESTIGATING 迁移有留痕
    assert {t["toStatus"] for t in detail["transitions"]} >= {"OPEN", "INVESTIGATING"}
    assert detail["ruleVersion"] == "demo-rules-v1"


def test_event_manual_action_and_illegal_conflict(client, token):
    event_id = _make_event("reach-b")
    h = {"Authorization": f"Bearer {token}"}
    # 合法升级
    resp = client.post(
        f"/api/events/{event_id}/actions",
        headers=h, json={"action": "ESCALATE", "reason": "持续超阈值"},
    )
    assert resp.status_code == 200 and resp.json()["status"] == "ESCALATED"
    # 非法：ESCALATED 不能直接 RECOVERED
    resp = client.post(
        f"/api/events/{event_id}/actions",
        headers=h, json={"action": "CONFIRM_RECOVERED"},
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "STATE_CONFLICT"


def test_events_open_in_demo_mode(client):
    # 演示模式免登录
    assert client.get("/api/events").status_code == 200


def test_events_filter_by_keyword_priority_and_paging(client, token):
    """D 阶段：关键字、等级筛选与分页 total 正确（隔离内存库）。"""
    eid = _make_event("reach-c")
    h = {"Authorization": f"Bearer {token}"}

    # 关键字：按事件编号
    r = client.get(f"/api/events?q={eid}", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1 and body["items"][0]["eventId"] == eid

    # 关键字：无匹配 → 空结果
    r = client.get("/api/events?q=zzz_no_such_event_zzz", headers=h)
    assert r.json()["total"] == 0 and r.json()["items"] == []

    # 节点 reach-c
    r = client.get("/api/events?reachId=reach-c", headers=h)
    assert all("reach-c" in x["scopeReachIds"] for x in r.json()["items"])
    assert any(x["eventId"] == eid for x in r.json()["items"])

    # 等级默认 NORMAL；造的事件升级后改优先级的逻辑不在本断言，仅验证参数被接受
    r = client.get("/api/events?priority=NORMAL", headers=h)
    assert r.status_code == 200
    assert all(x["priority"] == "NORMAL" for x in r.json()["items"])

    # 分页：pageSize=1 时两页各 1 条且 total 为全集大小
    all_total = client.get("/api/events?pageSize=200", headers=h).json()["total"]
    if all_total >= 2:
        p1 = client.get("/api/events?pageSize=1&page=1", headers=h).json()
        p2 = client.get("/api/events?pageSize=1&page=2", headers=h).json()
        assert len(p1["items"]) == 1 and len(p2["items"]) == 1
        assert p1["items"][0]["eventId"] != p2["items"][0]["eventId"]
        assert p1["total"] == p2["total"] == all_total
