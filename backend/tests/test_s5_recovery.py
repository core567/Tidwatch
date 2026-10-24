"""S5 关键观察点离线→迟到补数→受控再评估链路测试。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.db.session import SessionLocal
from app.models.event import ActiveEvent
from app.models.focus import BlindSpot
from app.services import blindspot_service
from app.services.event_service import EventProcessor

T0 = datetime(2026, 10, 23, 4, 0, tzinfo=timezone.utc)


def _obs(db, reach, t, wl, tu, mid):
    from uuid import uuid4
    from app.models.observation import Observation
    for metric, value, unit in (("waterLevel", wl, "m"), ("turbidity", tu, "NTU")):
        db.add(Observation(
            observation_id=f"obs-{uuid4().hex[:10]}", reach_id=reach, metric=metric,
            value=value, unit=unit, observed_at=t, ingested_at=t + timedelta(hours=2),
            source_type="SIMULATED", source_name="scenario-S5", scenario_id="S5",
            quality_flag="GOOD", rule_version="demo-rules-v1",
            message_id=mid, dedup_key=mid + metric,
        ))
    db.commit()


def _abnormal_ab(ep, db):
    for rid, minute in (("reach-a", 1), ("reach-b", 9)):
        _obs(db, rid, T0 + timedelta(minutes=minute - 1), 9.0, 20, f"S5-{rid}-1")
        mid = f"S5-{rid}-2"
        _obs(db, rid, T0 + timedelta(minutes=minute), 9.1, 20, mid)
        ep.process_sample(db, rid, T0 + timedelta(minutes=minute - 1), 9.0, 20, "S5", [])
        ep.process_sample(db, rid, T0 + timedelta(minutes=minute), 9.1, 20, "S5", [])
    return db.query(ActiveEvent).one()


def test_s5_blindspot_blocks_then_late_data_allows_reevaluation(clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    event = _abnormal_ab(ep, db)

    # C 形成盲区，事件无法恢复
    bs = blindspot_service.open_blind_spot(db, "reach-c", "数据链路中断", event_id=event.event_id)
    db.commit()
    # A、B 恢复正常（满足恢复窗口）
    for i in range(4):
        for rid in ("reach-a", "reach-b"):
            ep.process_sample(db, rid, T0 + timedelta(minutes=20 + i), 4.5, 20, "S5", [])
    db.refresh(event)
    assert event.status != "RECOVERED", "盲区未消除时事件不得恢复"

    # C 链路恢复：解除盲区
    resolved = blindspot_service.resolve_blind_spot(db, "reach-c", "迟到数据补齐，链路恢复")
    db.commit()
    assert resolved is not None and resolved.end_at is not None

    # C 迟到补数（observedAt 回填，连续 3 个正常点触发恢复）
    for i in range(3):
        late_t = T0 + timedelta(minutes=16 + i)
        _obs(db, "reach-c", late_t, 4.4, 20, f"S5-c-late-{i}")
        ep.process_sample(db, "reach-c", late_t, 4.4, 20, "S5", [])
    # A、B 再持续正常满足窗口
    for i in range(3):
        for rid in ("reach-a", "reach-b"):
            ep.process_sample(db, rid, T0 + timedelta(minutes=30 + i), 4.5, 20, "S5", [])
    db.refresh(event)
    # 盲区解除且全部断面正常后，事件可恢复（具体状态由恢复窗口决定）
    assert blindspot_service.has_open_blind_spot(db, ["reach-a", "reach-b", "reach-c"]) is False
    assert event.status == "RECOVERED"
    db.close()
