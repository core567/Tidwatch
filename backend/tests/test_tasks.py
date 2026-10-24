"""巡检任务闭环测试：Focus 自动派发 → 接受 → 开始 → 回填 → 证据/再评估。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.db.session import SessionLocal
from app.models.event import ActiveEvent
from app.models.evidence import Evidence, Hypothesis
from app.models.workflow import Assessment, InspectionTask, RunTrace
from app.services import task_service
from app.services.event_service import EventProcessor

T0 = datetime(2026, 10, 22, 4, 0, tzinfo=timezone.utc)


def _seed_event_ab(db, ep):
    """制造 A→B 事件（自动对 C 派发 Focus 任务）。"""
    from uuid import uuid4
    from app.models.observation import Observation

    def obs(rid, t, wl, tu):
        batch = uuid4().hex[:8]
        ids = []
        for metric, value, unit in (("waterLevel", wl, "m"), ("turbidity", tu, "NTU")):
            oid = f"obs-{uuid4().hex[:10]}"
            db.add(Observation(
                observation_id=oid, reach_id=rid, metric=metric, value=value, unit=unit,
                observed_at=t, ingested_at=t, source_type="SIMULATED",
                source_name="scenario-S2", scenario_id="S2", quality_flag="GOOD",
                rule_version="demo-rules-v1",
                message_id=f"S2-{rid}-{batch}-{metric}",
                dedup_key=f"S2-{rid}-{batch}-{metric}",
            ))
            ids.append(oid)
        db.commit()
        return ids

    for rid, minute in (("reach-a", 1), ("reach-b", 9)):
        ids1 = obs(rid, T0 + timedelta(minutes=minute - 1), 9.0, 20.0)
        ids2 = obs(rid, T0 + timedelta(minutes=minute), 9.1, 20.0)
        ep.process_sample(db, rid, T0 + timedelta(minutes=minute - 1), 9.0, 20.0, "S2", ids1)
        ep.process_sample(db, rid, T0 + timedelta(minutes=minute), 9.1, 20.0, "S2", ids2)
    return db.query(ActiveEvent).one()


@pytest.fixture()
def ctx(client, clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    event = _seed_event_ab(db, ep)
    yield db, event
    db.close()


def test_focus_auto_dispatches_task_for_c(ctx):
    db, event = ctx
    tasks = task_service.list_tasks(db, event_id=event.event_id)
    assert len(tasks) == 1
    task = tasks[0]
    assert task.reach_id == "reach-c"
    assert task.status == "PENDING"
    assert task.assignee == "inspector"


def test_task_lifecycle_and_submit_creates_evidence_and_assessment(ctx):
    db, event = ctx
    task = task_service.list_tasks(db, event_id=event.event_id)[0]
    asm_before = db.query(Assessment).filter_by(event_id=event.event_id).count()

    task_service.act_task(db, task.task_id, "ACCEPT", actor="u-inspector")
    db.refresh(task)
    assert task.status == "ACCEPTED"
    task_service.act_task(db, task.task_id, "START", actor="u-inspector")
    db.refresh(task)
    assert task.status == "IN_PROGRESS"

    # 现场回填：确认正常（对传播假设构成反证）
    task_service.submit_result(
        db, task.task_id,
        observation_note="C 断面现场水位正常，未见异常排放",
        conclusion="NORMAL", actor="u-inspector",
    )
    db.refresh(task)
    assert task.status == "SUBMITTED"
    assert task.completed_at is not None

    # MANUAL 证据 + 新版本评估
    manual = db.query(Evidence).filter_by(event_id=event.event_id, type="MANUAL").all()
    assert len(manual) == 1 and manual[0].polarity == "COUNTER"
    asm_after = db.query(Assessment).filter_by(event_id=event.event_id).count()
    assert asm_after == asm_before + 1

    # RunTrace 记录
    actions = [t.action for t in db.query(RunTrace).filter_by(task_id=task.task_id).all()]
    assert "task.submitted" in actions


def test_cannot_submit_without_start(ctx):
    from app.core.errors import ConflictError
    db, event = ctx
    task = task_service.list_tasks(db, event_id=event.event_id)[0]
    with pytest.raises(ConflictError):
        task_service.submit_result(
            db, task.task_id, observation_note="x", conclusion="NORMAL",
            actor="u-inspector",
        )
