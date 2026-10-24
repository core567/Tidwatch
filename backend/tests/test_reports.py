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
