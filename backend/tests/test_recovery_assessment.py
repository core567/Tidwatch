"""F1：规则化恢复评估（只读、三态、七因子）隔离内存库测试。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.db.session import SessionLocal
from app.models.event import ActiveEvent, EventScope, EventStatusTransition
from app.models.focus import BlindSpot
from app.models.observation import Observation
from app.models.workflow import InspectionTask, TaskReview, TaskSubmission
from app.services import recovery_service as rs
from app.core.errors import NotFoundError

T0 = datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc)


def _obs_id():
    return f"obs-{uuid4().hex[:12]}"


def seed_event(db, eid="TW-R", reaches=("reach-a",), status="RECOVERED"):
    db.add(ActiveEvent(
        event_id=eid, title="恢复评估测试", event_type="FLOOD_WARNING",
        status=status, priority="HIGH", first_seen_at=T0, version=1,
        rule_version="demo-rules-v1",
    ))
    import json
    db.add(EventScope(event_id=eid, version=1, reaches_json=json.dumps(list(reaches))))
    db.commit()


def add_obs(db, reach, metric, t, value, qf="GOOD"):
    db.add(Observation(
        observation_id=_obs_id(), reach_id=reach, metric=metric, value=value, unit="m",
        observed_at=t, ingested_at=t, source_type="SIMULATED", source_name="S",
        scenario_id="S2", quality_flag=qf, rule_version="demo-rules-v1",
        message_id=_obs_id(), dedup_key=_obs_id(),
    ))


def approved_task(db, eid, at):
    tid = f"tsk-{uuid4().hex[:10]}"
    db.add(InspectionTask(
        task_id=tid, event_id=eid, reach_id="reach-a", action_type="MANUAL_CHECK",
        title="核查", status="APPROVED", assignee="u-i", created_at=T0,
    ))
    db.add(TaskSubmission(
        submission_id=f"sub-{uuid4().hex[:12]}", task_id=tid, version=1,
        observation_note="已回落", conclusion="NORMAL", measurements_json="[]",
        observed_at=at, attachment_ids_json="[]", submitted_by="u-i", submitted_at=at,
    ))
    db.add(TaskReview(
        review_id=f"rev-{uuid4().hex[:12]}", task_id=tid,
        submission_id="", version=1, decision="APPROVED", comment="通过",
        reviewer="u-admin", reviewed_at=at,
    ))
    db.commit()
    return tid


def test_unknown_event_404(client, clean_event_tables):
    s = SessionLocal()
    with pytest.raises(NotFoundError):
        rs.assess_recovery(s, "NOPE")
    s.close()


def test_insufficient_when_no_anchor(client, clean_event_tables):
    s = SessionLocal()
    seed_event(s, "TW-NA", status="INVESTIGATING")
    r = rs.assess_recovery(s, "TW-NA")
    assert r["result"] == rs.INSUFFICIENT_EVIDENCE
    codes = {f["code"]: f["passed"] for f in r["factors"]}
    assert codes["F1_ANCHOR"] is False
    assert r["anchor"]["at"] is None
    s.close()


def test_supported_recovery_full_chain(client, clean_event_tables):
    """锚点(APPROVED)+基线正常+处置后回落+样本充足+无盲区 → 支持恢复。"""
    s = SessionLocal()
    eid = "TW-OK"
    seed_event(s, eid, reaches=("reach-a",), status="RECOVERED")
    anchor = T0 + timedelta(hours=2)
    # 基线窗（首现前60分钟）水位稳定 4.x
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", T0 - timedelta(minutes=50 - i * 8), 4.2 + 0.02 * i)
    # 异常期间高水位（峰值 ~9）
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", T0 + timedelta(minutes=20 + i * 12), 8.5 + 0.1 * i)
    # 处置后窗回落到基线带
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", anchor + timedelta(minutes=4 + i * 8), 4.25 + 0.02 * i)
    approved_task(s, eid, anchor)
    s.commit()
    r = rs.assess_recovery(s, eid)
    codes = {f["code"]: f["passed"] for f in r["factors"]}
    assert codes["F1_ANCHOR"] is True
    assert codes["F4_REVIEW_CLOSED"] is True
    assert codes["F5_NO_OPEN_BLINDSPOT"] is True
    assert r["result"] == rs.RECOVERED_SUPPORTED, r
    # 锚点标注为复核时间
    assert r["anchor"]["source"] == "task_review.approved"
    assert "复核时间" in r["anchor"]["note"]
    # 有窗口数据
    phases = {(w["metric"], w["phase"]): w for w in r["windows"] if w["reachId"] == "reach-a"}
    assert phases[("waterLevel", "POST")]["sampleCount"] >= 3
    s.close()


def test_single_point_drop_is_not_enough(client, clean_event_tables):
    """只有 1 个回落点（样本不足）→ 不能判支持恢复。"""
    s = SessionLocal()
    eid = "TW-1PT"
    seed_event(s, eid, reaches=("reach-a",), status="RECOVERED")
    anchor = T0 + timedelta(hours=2)
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", T0 - timedelta(minutes=50 - i * 8), 4.2 + 0.02 * i)
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", T0 + timedelta(minutes=20 + i * 12), 8.5 + 0.1 * i)
    add_obs(s, "reach-a", "waterLevel", anchor + timedelta(minutes=5), 4.3)  # 单点
    approved_task(s, eid, anchor)
    r = rs.assess_recovery(s, eid)
    assert r["result"] == rs.INSUFFICIENT_EVIDENCE
    assert {f["code"]: f["passed"] for f in r["factors"]}["F3_SAMPLE_QUALITY"] is False
    s.close()


def test_still_high_after_action_needs_observation(client, clean_event_tables):
    """处置后仍超基线带 → 仍需观察。"""
    s = SessionLocal()
    eid = "TW-HI"
    seed_event(s, eid, reaches=("reach-a",), status="RECOVERY_PENDING")
    anchor = T0 + timedelta(hours=2)
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", T0 - timedelta(minutes=50 - i * 8), 4.2 + 0.02 * i)
    # 异常与处置后都高
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", T0 + timedelta(minutes=20 + i * 12), 8.5 + 0.1 * i)
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", anchor + timedelta(minutes=4 + i * 8), 8.4 + 0.1 * i)
    approved_task(s, eid, anchor)
    r = rs.assess_recovery(s, eid)
    assert r["result"] == rs.NEEDS_OBSERVATION
    assert {f["code"]: f["passed"] for f in r["factors"]}["F2_OBSERVATION_RETURN"] is False
    s.close()


def test_open_blindspot_blocks_support(client, clean_event_tables):
    s = SessionLocal()
    eid = "TW-BS"
    seed_event(s, eid, reaches=("reach-a",), status="RECOVERY_PENDING")
    anchor = T0 + timedelta(hours=2)
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", T0 - timedelta(minutes=50 - i * 8), 4.2 + 0.02 * i)
    for i in range(5):
        add_obs(s, "reach-a", "waterLevel", anchor + timedelta(minutes=4 + i * 8), 4.25 + 0.02 * i)
    approved_task(s, eid, anchor)
    s.add(BlindSpot(blind_spot_id=f"bl-{uuid4().hex[:8]}", event_id=eid,
                    reach_id="reach-a", reason="LINK_DOWN", impact="x",
                    start_at=T0, end_at=None))
    s.commit()
    r = rs.assess_recovery(s, eid)
    assert r["result"] == rs.NEEDS_OBSERVATION
    assert {f["code"]: f["passed"] for f in r["factors"]}["F5_NO_OPEN_BLINDSPOT"] is False
    s.close()


def test_assessment_is_readonly(client, clean_event_tables):
    """重复调用结果稳定，且不改变事件状态/不新增业务行。"""
    s = SessionLocal()
    seed_event(s, "TW-RO", status="INVESTIGATING")
    before_status = s.get(ActiveEvent, "TW-RO").status
    n_tasks = s.query(InspectionTask).count()
    n_trans = s.query(EventStatusTransition).count()
    r1 = rs.assess_recovery(s, "TW-RO")
    r2 = rs.assess_recovery(s, "TW-RO")
    assert r1["result"] == r2["result"]
    assert s.get(ActiveEvent, "TW-RO").status == before_status
    assert s.query(InspectionTask).count() == n_tasks
    assert s.query(EventStatusTransition).count() == n_trans
    s.close()
