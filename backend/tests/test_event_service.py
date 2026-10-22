"""事件服务测试：S2/S3 核心语义——建事件、范围版本、时序关系、Focus、恢复。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.errors import ConflictError
from app.db.session import SessionLocal
from app.models.event import ActiveEvent, EventScope, TemporalRelation
from app.models.focus import ObservationFocus
from app.models.observation import Observation
from app.services.event_service import EventProcessor

T0 = datetime(2026, 10, 22, 4, 0, tzinfo=timezone.utc)


def _obs(db, reach, t, wl, tu, scenario="S2") -> list[str]:
    """插入一条多指标观测（两条记录），返回 observation ids。每条消息唯一。"""
    ids = []
    batch = uuid4().hex[:10]
    for metric, value, unit in (("waterLevel", wl, "m"), ("turbidity", tu, "NTU")):
        oid = f"obs-{uuid4().hex[:16]}"
        db.add(Observation(
            observation_id=oid, reach_id=reach, metric=metric, value=value, unit=unit,
            observed_at=t, ingested_at=t, source_type="SIMULATED",
            source_name=f"scenario-{scenario}", scenario_id=scenario,
            quality_flag="GOOD", rule_version="demo-rules-v1",
            message_id=f"{scenario}-{reach}-{batch}-{metric}",
            dedup_key=f"{scenario}-{reach}-{batch}-{metric}",
        ))
        ids.append(oid)
    db.commit()
    return ids


@pytest.fixture()
def ep(client):
    """每个用例：清空事件相关表并返回全新处理器，避免 session 级库串扰。"""
    from app.models.event import ChangeEvent, EventScope, EventStatusTransition, TemporalRelation
    from app.models.evidence import Evidence
    from app.models.focus import ObservationFocus
    from app.models.workflow import RunTrace
    from app.models.observation import Observation as Obs

    db = SessionLocal()
    for model in (TemporalRelation, ChangeEvent, EventStatusTransition, EventScope,
                  Evidence, ObservationFocus, RunTrace, Obs, ActiveEvent):
        db.query(model).delete()
    db.commit()
    db.close()
    return EventProcessor()


def test_timezone_plus8_does_not_corrupt_temporal_delta(ep):
    """回归：observedAt 带 +08:00 时，时序关系 delta 必须是真实 8 分钟而非时区偏移。"""
    cst = timezone(timedelta(hours=8))
    db = SessionLocal()
    try:
        t0 = datetime(2026, 10, 22, 12, 0, tzinfo=cst)
        for rid, minute in (("reach-a", 1), ("reach-b", 9)):
            ids1 = _obs(db, rid, t0 + timedelta(minutes=minute - 1), 9.0, 20)
            ids2 = _obs(db, rid, t0 + timedelta(minutes=minute), 9.1, 20)
            ep.process_sample(db, rid, t0 + timedelta(minutes=minute - 1), 9.0, 20, "S2", ids1)
            ev = ep.process_sample(db, rid, t0 + timedelta(minutes=minute), 9.1, 20, "S2", ids2)
        assert ev is not None
        rel = db.query(TemporalRelation).one()
        assert rel.delta_seconds == 8 * 60  # 不是 -28800 类的时区错误
    finally:
        db.close()


def _scope(db, event_id: str) -> list[str]:
    import json
    row = db.query(EventScope).filter_by(event_id=event_id).order_by(
        EventScope.version.desc()
    ).first()
    return json.loads(row.reaches_json)


def test_s2_creates_single_event_when_a_then_b_abnormal(ep):
    db = SessionLocal()
    try:
        # A 连续两个高水位点（每条观测都驱动检测器）
        ids_a1 = _obs(db, "reach-a", T0, 9.0, 20)
        ids_a2 = _obs(db, "reach-a", T0 + timedelta(minutes=1), 9.1, 20)
        e1 = ep.process_sample(db, "reach-a", T0, 9.0, 20, "S2", ids_a1)
        e2 = ep.process_sample(db, "reach-a", T0 + timedelta(minutes=1), 9.1, 20, "S2", ids_a2)
        assert e1 is None  # 第一点不确认
        assert e2 is not None
        assert e2.event_id.startswith("TW-")
        assert e2.status == "INVESTIGATING"  # 自动进入调查
        assert _scope(db, e2.event_id) == ["reach-a"]

        # B 随后连续两点异常：第二点确认时归入同一事件并扩展范围
        ids_b1 = _obs(db, "reach-b", T0 + timedelta(minutes=8), 9.0, 20)
        ids_b2 = _obs(db, "reach-b", T0 + timedelta(minutes=9), 9.05, 20)
        ev_b1 = ep.process_sample(db, "reach-b", T0 + timedelta(minutes=8), 9.0, 20, "S2", ids_b1)
        ev_b2 = ep.process_sample(db, "reach-b", T0 + timedelta(minutes=9), 9.05, 20, "S2", ids_b2)
        assert ev_b1 is None  # B 第一点尚不确认
        assert ev_b2.event_id == e2.event_id  # 不新建第二个事件
        assert _scope(db, e2.event_id) == ["reach-a", "reach-b"]
        db.refresh(ev_b2)
        assert ev_b2.version == 2

        # 自动建立对 C 的观察重点
        focus = db.query(ObservationFocus).filter_by(
            event_id=e2.event_id, reach_id="reach-c"
        ).one()
        assert focus.status == "ACTIVE"

        # 时序关系：A→B 只陈述先后，不构成因果
        rels = db.query(TemporalRelation).all()
        assert len(rels) >= 1
        rel = rels[0]
        assert rel.relation_type == "OBSERVED_SEQUENCE"
        assert 0 < rel.delta_seconds <= 20 * 60
    finally:
        db.close()


def test_s3_c_change_expands_scope_to_three(ep):
    db = SessionLocal()
    try:
        # A、B 已确认
        for rid, base_t in (("reach-a", T0), ("reach-b", T0 + timedelta(minutes=8))):
            ids1 = _obs(db, rid, base_t, 9.0, 20)
            ids2 = _obs(db, rid, base_t + timedelta(minutes=1), 9.1, 20)
            assert ep.process_sample(db, rid, base_t, 9.0, 20, "S3", ids1) is None
            ep.process_sample(db, rid, base_t + timedelta(minutes=1), 9.1, 20, "S3", ids2)

        event_before = db.query(ActiveEvent).one()
        assert _scope(db, event_before.event_id) == ["reach-a", "reach-b"]

        # C 同向变化（两个异常点都要驱动检测器）
        ct = T0 + timedelta(minutes=16)
        ids_c1 = _obs(db, "reach-c", ct, 9.0, 20)
        ids_c2 = _obs(db, "reach-c", ct + timedelta(minutes=1), 9.1, 20)
        assert ep.process_sample(db, "reach-c", ct, 9.0, 20, "S3", ids_c1) is None
        ev = ep.process_sample(db, "reach-c", ct + timedelta(minutes=1), 9.1, 20, "S3", ids_c2)
        assert ev.event_id == event_before.event_id
        assert _scope(db, event_before.event_id) == ["reach-a", "reach-b", "reach-c"]
        db.refresh(ev)
        assert ev.version == 3
        # 三断面齐了，不再有 ACTIVE focus
        assert db.query(ObservationFocus).filter_by(status="ACTIVE").count() == 0
    finally:
        db.close()


def test_single_spike_does_not_create_event(ep):
    db = SessionLocal()
    try:
        ids = _obs(db, "reach-a", T0, 9.0, 20)
        ev = ep.process_sample(db, "reach-a", T0, 9.0, 20, "S2", ids)
        assert ev is None
        assert db.query(ActiveEvent).count() == 0
    finally:
        db.close()


def test_s1_normal_data_creates_no_event(ep):
    db = SessionLocal()
    try:
        for i in range(40):
            t = T0 + timedelta(seconds=i)
            ids = _obs(db, "reach-a", t, 4.5 + (i % 3) * 0.1, 20.0, scenario="S1")
            ep.process_sample(db, "reach-a", t, 4.5 + (i % 3) * 0.1, 20.0, "S1", ids)
        assert db.query(ActiveEvent).count() == 0
    finally:
        db.close()


def test_recovery_closes_event_after_consecutive_normal(ep):
    db = SessionLocal()
    try:
        ids0 = _obs(db, "reach-a", T0, 9.0, 20)
        ids = _obs(db, "reach-a", T0 + timedelta(seconds=1), 9.0, 20)
        assert ep.process_sample(db, "reach-a", T0, 9.0, 20, "S2", ids0) is None
        event = ep.process_sample(db, "reach-a", T0 + timedelta(seconds=1), 9.0, 20, "S2", ids)
        assert event.status == "INVESTIGATING"

        # 连续 3 个正常点 → RECOVERY_PENDING → RECOVERED
        for i in range(3):
            t = T0 + timedelta(seconds=10 + i)
            nids = _obs(db, "reach-a", t, 4.5, 20)
            ep.process_sample(db, "reach-a", t, 4.5, 20, "S2", nids)
        db.refresh(event)
        assert event.status == "RECOVERED"
    finally:
        db.close()


def test_manual_illegal_action_rejected(ep):
    db = SessionLocal()
    try:
        ids0 = _obs(db, "reach-a", T0, 9.0, 20)
        ids = _obs(db, "reach-a", T0 + timedelta(seconds=1), 9.0, 20)
        assert ep.process_sample(db, "reach-a", T0, 9.0, 20, "S2", ids0) is None
        event = ep.process_sample(db, "reach-a", T0 + timedelta(seconds=1), 9.0, 20, "S2", ids)
        # 已 INVESTIGATING，直接 CONFIRM_RECOVERED 必须拒绝（需先过恢复窗口）
        with pytest.raises(ConflictError):
            ep.apply_manual_action(db, event.event_id, "CONFIRM_RECOVERED", "u-admin", "跳过恢复窗口")
        # 合法升级
        ev2 = ep.apply_manual_action(db, event.event_id, "ESCALATE", "u-admin", "人工升级")
        assert ev2.status == "ESCALATED"
    finally:
        db.close()
