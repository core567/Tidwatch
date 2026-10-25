"""研判单生成测试：聚合事件证据/范围/版本/未解决项。"""
from __future__ import annotations

import pytest

from app.db.session import SessionLocal
from app.models.workflow import EventReview
from app.services.event_service import EventProcessor
from app.services import report_service
from tests.test_scenarios import _play
from tidewatch_sim.generator import S2, S4  # noqa: E402


def test_review_aggregates_s2_event(clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    _play(S2, db, ep)
    event_id = db.query(__import__("app.models.event", fromlist=["ActiveEvent"]).ActiveEvent).first().event_id

    payload = report_service.build_review_payload(db, event_id)
    assert payload["eventId"] == event_id
    assert payload["scope"] == ["reach-a", "reach-b"]
    assert len(payload["temporalRelations"]) == 1
    # 至少 2 个范围版本
    assert len(payload["scopeHistory"]) >= 2
    # 有支持证据与初始假设
    assert len(payload["supportingEvidence"]) >= 2
    assert len(payload["hypotheses"]) >= 1
    # 研判单含免责声明（非因果）
    assert "因果" in payload["disclaimer"]
    db.close()


def test_persist_review_creates_snapshot(clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    _play(S2, db, ep)
    from app.models.event import ActiveEvent
    event_id = db.query(ActiveEvent).first().event_id
    review = report_service.persist_review(db, event_id, created_by="u-admin")
    db.commit()
    assert review.review_id.startswith("rpt-")
    saved = db.query(EventReview).filter_by(event_id=event_id).one()
    import json
    snap = json.loads(saved.evidence_snapshot_json)
    assert snap["eventId"] == event_id
    assert snap["scope"] == ["reach-a", "reach-b"]
    db.close()


def test_s4_review_has_unresolved_or_unsupported(clean_event_tables):
    db = SessionLocal()
    ep = EventProcessor()
    _play(S4, db, ep)
    from app.models.event import ActiveEvent
    event_id = db.query(ActiveEvent).first().event_id
    payload = report_service.build_review_payload(db, event_id)
    # C 不扩展，传播假设不支持
    states = {h["state"] for h in payload["hypotheses"]}
    assert "NOT_SUPPORT" in states
    assert "reach-c" not in payload["scope"]
    db.close()


def test_review_unknown_event_404(clean_event_tables):
    from app.core.errors import NotFoundError
    db = SessionLocal()
    with pytest.raises(NotFoundError):
        report_service.build_review_payload(db, "TW-999")
    db.close()


def test_review_payload_has_task_versions_compat(clean_event_tables):
    """F1：review payload 增量含 taskSubmissions/taskReviews，旧字段保留。"""
    from datetime import datetime, timezone
    from app.models.event import ActiveEvent, EventScope
    from app.models.workflow import InspectionTask, TaskSubmission, TaskReview
    import json
    db = SessionLocal()
    now = datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc)
    db.add(ActiveEvent(event_id="TW-RV", title="x", event_type="FLOOD", status="RECOVERED",
                       priority="NORMAL", first_seen_at=now, version=1, rule_version="demo-rules-v1"))
    db.add(EventScope(event_id="TW-RV", version=1, reaches_json='["reach-a"]'))
    db.add(InspectionTask(task_id="tsk-rv", event_id="TW-RV", reach_id="reach-a",
                          action_type="MANUAL_CHECK", title="t", status="APPROVED", created_at=now))
    db.add(TaskSubmission(submission_id="sub-rv", task_id="tsk-rv", version=1,
                          observation_note="ok", conclusion="NORMAL", measurements_json="[]",
                          observed_at=now, attachment_ids_json='["att-1"]',
                          submitted_by="u-i", submitted_at=now))
    db.add(TaskReview(review_id="rev-rv", task_id="tsk-rv", submission_id="sub-rv", version=1,
                      decision="APPROVED", comment="通过", reviewer="u-admin", reviewed_at=now))
    db.commit()
    p = report_service.build_review_payload(db, "TW-RV")
    # 旧字段仍在
    for k in ("eventId", "scope", "tasks", "trace", "disclaimer"):
        assert k in p
    # 增量字段
    assert p["taskSubmissions"][0]["version"] == 1 and p["taskSubmissions"][0]["attachmentIds"] == ["att-1"]
    assert p["taskReviews"][0]["decision"] == "APPROVED"
    # tasks 内嵌版本/复核
    assert p["tasks"][0]["submissions"][0]["submissionId"] == "sub-rv"
    assert p["tasks"][0]["reviews"][0]["reviewId"] == "rev-rv"
    db.close()
