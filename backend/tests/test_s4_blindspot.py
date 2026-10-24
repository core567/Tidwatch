"""S4 反例与盲区服务测试。"""
from __future__ import annotations

import pytest

from app.db.session import SessionLocal
from app.models.event import ActiveEvent
from app.models.evidence import Hypothesis
from app.models.focus import BlindSpot, ObservationFocus
from app.models.workflow import Assessment
from app.services import blindspot_service
from app.services.event_service import EventProcessor
from app.models.event import EventScope
import json

# clean_event_tables fixture 来自 conftest；_play 是场景播放辅助
from tests.test_scenarios import _play  # noqa: F401
from tidewatch_sim.generator import S4  # noqa: E402


def test_s4_does_not_expand_to_c_and_hypothesis_unsupported(clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    _play(S4, db, ep)
    events = db.query(ActiveEvent).all()
    assert len(events) == 1
    event = events[0]
    scope = json.loads(
        db.query(EventScope.reaches_json)
        .filter_by(event_id=event.event_id)
        .order_by(EventScope.version.desc())
        .limit(1)
        .scalar()
    )
    # C 始终稳定，范围不应包含 C
    assert "reach-c" not in scope
    assert set(scope) == {"reach-a", "reach-b"}

    # 至少一个假设被降级为 NOT_SUPPORT，且有反证证据
    states = [h.state for h in db.query(Hypothesis).filter_by(event_id=event.event_id)]
    assert "NOT_SUPPORT" in states

    # 存在“不扩展”的再评估版本
    reasons = [a.scope_change_reason or "" for a in db.query(Assessment).filter_by(event_id=event.event_id)]
    assert any("reach-c" in r and ("稳定" in r or "不" in r) for r in reasons)

    # 对 C 的 Focus 应已关闭
    active_focus = db.query(ObservationFocus).filter_by(
        event_id=event.event_id, status="ACTIVE"
    ).all()
    assert all(f.reach_id != "reach-c" for f in active_focus)
    db.close()


def test_blindspot_blocks_event_recovery(clean_event_tables):
    """S5 语义：范围内存在开放盲区时，即使某断面恢复，事件也不能关闭。"""
    from datetime import datetime, timezone, timedelta
    from app.models.event import ActiveEvent, EventScope
    from app.services.event_service import EventProcessor

    db = SessionLocal()
    ep = EventProcessor()
    t0 = datetime(2026, 10, 22, 4, 0, tzinfo=timezone.utc)
    # A、B 连续异常建立事件
    for rid, minute in (("reach-a", 1), ("reach-b", 9)):
        ep.process_sample(db, rid, t0 + timedelta(minutes=minute - 1), 9.0, 20.0, "S5", [])
        ep.process_sample(db, rid, t0 + timedelta(minutes=minute), 9.1, 20.0, "S5", [])
    event = db.query(ActiveEvent).one()
    # C（Focus）形成盲区
    blindspot_service.open_blind_spot(db, "reach-c", "数据链路中断", event_id=event.event_id)
    db.commit()
    assert blindspot_service.has_open_blind_spot(db, ["reach-a", "reach-b", "reach-c"])
    # A、B 随后连续正常（3 点恢复窗口）
    for i in range(4):
        for rid in ("reach-a", "reach-b"):
            ep.process_sample(db, rid, t0 + timedelta(minutes=20 + i), 4.5, 20.0, "S5", [])
    db.refresh(event)
    # 因 C 盲区未消除，事件不得 RECOVERED
    assert event.status != "RECOVERED"
    db.close()


def test_blindspot_open_resolve_and_blocking():
    db = SessionLocal()
    bs = blindspot_service.open_blind_spot(db, "reach-c", "数据链路中断", event_id=None)
    db.commit()
    assert blindspot_service.has_open_blind_spot(db, ["reach-c"]) is True
    assert blindspot_service.has_open_blind_spot(db, ["reach-a"]) is False
    # 重复打开不产生第二条
    again = blindspot_service.open_blind_spot(db, "reach-c", "再次中断", event_id=None)
    db.commit()
    assert again.blind_spot_id == bs.blind_spot_id
    resolved = blindspot_service.resolve_blind_spot(db, "reach-c", "链路恢复")
    db.commit()
    assert resolved is not None and resolved.end_at is not None
    assert blindspot_service.has_open_blind_spot(db, ["reach-c"]) is False
    db.close()
