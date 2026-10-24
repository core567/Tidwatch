"""S2/S3 场景脚本与事件处理器的端到端确定性测试（不依赖 MQTT）。

直接把场景生成器每个 tick 的值按虚拟时间喂给 EventProcessor，
验证 GRP 要求的单事件、范围扩展、时序关系、Focus。
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app.db.session import SessionLocal
from app.models.event import ActiveEvent, TemporalRelation
from app.models.focus import BlindSpot, ObservationFocus
from app.models.observation import Observation
from app.services.event_service import EventProcessor
from app.models.event import EventScope
import json

SIM_PATH = Path(__file__).resolve().parents[2] / "simulator"
if str(SIM_PATH) not in sys.path:
    sys.path.insert(0, str(SIM_PATH))

from tidewatch_sim.generator import S1, S2, S3, anomaly_value, build_walkers  # noqa: E402


def _play(spec, db, processor):
    """按场景脚本逐 tick 喂值（仅水位/浊度，flow 不影响判级）。"""
    walkers = build_walkers(spec)
    base = datetime(2026, 10, 22, 12, 0, tzinfo=timezone(timedelta(hours=8)))
    for tick in range(1, (spec.total_ticks or 0) + 1):
        vtime = base + timedelta(seconds=spec.tick_step_seconds * (tick - 1))
        for rid in ("reach-a", "reach-b", "reach-c"):
            wl_forced = anomaly_value(spec, rid, tick, "waterLevel")
            wl = wl_forced if wl_forced is not None else walkers[rid]["waterLevel"].next()
            tu = walkers[rid]["turbidity"].next()
            batch = uuid4().hex[:8]
            ids = []
            for metric, value, unit in (("waterLevel", wl, "m"), ("turbidity", tu, "NTU")):
                oid = f"obs-{uuid4().hex[:12]}"
                db.add(Observation(
                    observation_id=oid, reach_id=rid, metric=metric, value=value, unit=unit,
                    observed_at=vtime, ingested_at=vtime, source_type="SIMULATED",
                    source_name=f"scenario-{spec.scenario_id}", scenario_id=spec.scenario_id,
                    quality_flag="GOOD", rule_version="demo-rules-v1",
                    message_id=f"{spec.scenario_id}-{rid}-{batch}-{metric}",
                    dedup_key=f"{spec.scenario_id}-{rid}-{batch}-{metric}",
                ))
                ids.append(oid)
            db.commit()
            processor.process_sample(db, rid, vtime, wl, tu, spec.scenario_id, ids)


def _scope(db, event_id):
    row = db.query(EventScope).filter_by(event_id=event_id).order_by(
        EventScope.version.desc()
    ).first()
    return json.loads(row.reaches_json)


def test_s2_has_initial_hypothesis_and_assessment(clean_event_tables):
    from app.models.evidence import Hypothesis
    from app.models.workflow import Assessment
    db = SessionLocal()
    ep = EventProcessor()
    _play(S2, db, ep)
    event = db.query(ActiveEvent).one()
    # 初始假设：下游可能同向变化，OPEN/PARTIAL
    hyps = db.query(Hypothesis).filter_by(event_id=event.event_id).all()
    assert len(hyps) >= 1
    assert any("传播" in h.statement or "同向" in h.statement for h in hyps)
    # 至少一个再评估版本（v1）
    asm = db.query(Assessment).filter_by(event_id=event.event_id).order_by(
        Assessment.assessment_version
    ).all()
    assert len(asm) >= 1
    assert asm[0].current_scope_json == json.dumps(["reach-a"], ensure_ascii=False)
    db.close()


def test_s3_assessment_versions_capture_scope_diff(clean_event_tables):
    from app.models.workflow import Assessment
    db = SessionLocal()
    ep = EventProcessor()
    _play(S3, db, ep)
    event = db.query(ActiveEvent).one()
    versions = db.query(Assessment).filter_by(event_id=event.event_id).order_by(
        Assessment.assessment_version
    ).all()
    # S3 三断面扩展，应至少 3 个版本，最后版本范围 A/B/C
    assert len(versions) >= 3
    assert json.loads(versions[-1].current_scope_json) == ["reach-a", "reach-b", "reach-c"]
    # 每个版本范围单调扩大
    scopes = [json.loads(v.current_scope_json) for v in versions]
    assert len(scopes[-1]) > len(scopes[0])
    db.close()


def test_s1_scenario_produces_no_event(clean_event_tables):
    """S1 完整播放 60 tick，事件链路必须零事件、零变化、零时序关系。"""
    db = SessionLocal()
    ep = EventProcessor()
    walkers = build_walkers(S1)
    base = datetime(2026, 10, 22, 8, 0, tzinfo=timezone.utc)
    for tick in range(1, 61):
        vtime = base + timedelta(seconds=tick - 1)
        for rid in ("reach-a", "reach-b", "reach-c"):
            wl = walkers[rid]["waterLevel"].next()
            tu = walkers[rid]["turbidity"].next()
            result = ep.process_sample(db, rid, vtime, wl, tu, "S1", [])
            assert result is None, f"S1 第 {tick} tick 不应产生事件: {rid}"
    assert db.query(ActiveEvent).count() == 0
    from app.models.event import ChangeEvent

    assert db.query(ChangeEvent).count() == 0
    assert db.query(TemporalRelation).count() == 0
    db.close()


def test_s2_scenario_single_event_ab_with_focus_c(clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    _play(S2, db, ep)
    events = db.query(ActiveEvent).all()
    assert len(events) == 1, "S2 必须只产生一个事件"
    event = events[0]
    assert _scope(db, event.event_id) == ["reach-a", "reach-b"]
    assert event.version == 2
    rels = db.query(TemporalRelation).all()
    assert len(rels) == 1
    assert rels[0].relation_type == "OBSERVED_SEQUENCE"
    assert rels[0].delta_seconds == 540  # 9 分钟
    focus = db.query(ObservationFocus).filter_by(status="ACTIVE").one()
    assert focus.reach_id == "reach-c"
    db.close()


def test_s3_scenario_single_event_abc(clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    _play(S3, db, ep)
    events = db.query(ActiveEvent).all()
    assert len(events) == 1
    event = events[0]
    assert _scope(db, event.event_id) == ["reach-a", "reach-b", "reach-c"]
    assert event.version == 3
    rels = db.query(TemporalRelation).all()
    assert {r.delta_seconds for r in rels} == {540.0, 1080.0}
    assert db.query(ObservationFocus).filter_by(status="ACTIVE").count() == 0
    db.close()
