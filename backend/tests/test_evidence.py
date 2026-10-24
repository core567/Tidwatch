"""证据与假设服务测试：三性来源、假设状态随证据变化。"""
from __future__ import annotations

import pytest

from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.evidence import Evidence, Hypothesis
from app.services import evidence_service as svc


@pytest.fixture()
def event_id(client):
    """直接造一个事件头记录（事件服务在别处测试）。"""
    from app.models.event import ActiveEvent
    from datetime import datetime, timezone

    db = SessionLocal()
    e = ActiveEvent(
        event_id="TW-T1", title="测试事件", event_type="WATER_LEVEL_ALERT",
        status="INVESTIGATING", priority="HIGH",
        first_seen_at=datetime(2026, 10, 22, tzinfo=timezone.utc),
        version=1, rule_version="demo-rules-v1",
    )
    db.add(e)
    db.commit()
    db.close()
    yield "TW-T1"
    db = SessionLocal()
    from app.models.workflow import RunTrace
    from app.models.event import ActiveEvent as AE
    db.query(Hypothesis).filter_by(event_id="TW-T1").delete()
    db.query(Evidence).filter_by(event_id="TW-T1").delete()
    db.query(RunTrace).filter_by(event_id="TW-T1").delete()
    db.query(AE).filter_by(event_id="TW-T1").delete()
    db.commit()
    db.close()


def test_add_and_list_evidence(event_id):
    db = SessionLocal()
    e = svc.add_evidence(
        db, event_id, type="OBSERVATION", source_ref="chg-1",
        polarity="SUPPORT", note="连续高水位", created_by="u-admin",
    )
    db.commit()
    items = svc.list_evidence(db, event_id)
    assert len(items) == 1
    assert items[0].type == "OBSERVATION" and items[0].polarity == "SUPPORT"
    db.close()


def test_invalid_type_or_polarity_rejected(event_id):
    db = SessionLocal()
    with pytest.raises(AppError):
        svc.add_evidence(db, event_id, type="GOSSIP", source_ref="x", polarity="SUPPORT")
    with pytest.raises(AppError):
        svc.add_evidence(db, event_id, type="RULE", source_ref="x", polarity="MAYBE")
    db.close()


def test_hypothesis_state_follows_evidence(event_id):
    db = SessionLocal()
    e1 = svc.add_evidence(db, event_id, type="OBSERVATION", source_ref="c1", polarity="SUPPORT")
    e2 = svc.add_evidence(db, event_id, type="OBSERVATION", source_ref="c2", polarity="SUPPORT")
    ec = svc.add_evidence(db, event_id, type="OBSERVATION", source_ref="c3", polarity="COUNTER")
    db.flush()

    h = svc.create_hypothesis(db, event_id, "上游来水导致水位持续偏高",
                               basis_evidence=[e1.evidence_id])
    db.flush()
    assert h.state == "PARTIAL_SUPPORT"  # 1 条支持

    svc.link_evidence(db, h.hypothesis_id, "SUPPORT", [e2.evidence_id])
    assert h.state == "SUPPORT"  # 2 条支持

    # 反证出现 → PARTIAL_SUPPORT（结论强度不得超过证据）
    svc.link_evidence(db, h.hypothesis_id, "COUNTER", [ec.evidence_id])
    assert h.state == "PARTIAL_SUPPORT"

    # 不存在的证据不能链接
    with pytest.raises(Exception):
        svc.link_evidence(db, h.hypothesis_id, "SUPPORT", ["evi-nonexistent"])
    db.rollback()
    db.close()


def test_unknown_hypothesis_404(event_id):
    db = SessionLocal()
    with pytest.raises(Exception):
        svc.link_evidence(db, "hyp-nope", "SUPPORT", ["x"])
    db.close()
