"""MQTT 观测入库服务测试：校验、幂等、乱序/迟到、死信。"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from app.db.session import SessionLocal
from app.ingestion.observation_service import process_observation_payload
from app.models.ingestion import IngestionError, ProcessedMessage
from app.models.observation import Observation
from app.models.reach import Reach

TOPIC_A = "tidewatch/v1/reach-a/observation"


def make_message(message_id: str, observed_at: datetime, **overrides) -> str:
    body = {
        "messageId": message_id,
        "reachId": "reach-a",
        "observedAt": observed_at.isoformat(),
        "scenarioId": "S1",
        "sourceType": "SIMULATED",
        "metrics": {
            "waterLevel": {"value": 4.5, "unit": "m"},
            "turbidity": {"value": 20, "unit": "NTU"},
            "flowLevel": {"value": 1, "unit": "enum0-3"},
        },
    }
    body.update(overrides)
    return json.dumps(body, ensure_ascii=False)


@pytest.fixture(autouse=True)
def reset_reach_a():
    """每个用例后把 reach-a 恢复 OFFLINE，避免相互影响。"""
    yield
    db = SessionLocal()
    r = db.get(Reach, "reach-a")
    if r:
        r.online_status = "OFFLINE"
        db.commit()
    db.close()


def test_valid_message_persists_three_observations():
    db = SessionLocal()
    before = db.query(Observation).filter(Observation.reach_id == "reach-a").count()
    out = process_observation_payload(
        db, make_message("m-valid-1", datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)), TOPIC_A
    )
    assert out.accepted and not out.duplicate
    assert len(out.observation_ids) == 3
    after = db.query(Observation).filter(Observation.reach_id == "reach-a").count()
    assert after - before == 3
    reach = db.get(Reach, "reach-a")
    assert reach.online_status == "ONLINE"
    assert db.get(ProcessedMessage, "m-valid-1") is not None
    db.close()


def test_duplicate_message_is_idempotent():
    db = SessionLocal()
    raw = make_message("m-dup-1", datetime(2026, 10, 21, 10, 5, tzinfo=timezone.utc))
    r1 = process_observation_payload(db, raw, TOPIC_A)
    count_after_first = db.query(Observation).filter(Observation.message_id == "m-dup-1").count()
    r2 = process_observation_payload(db, raw, TOPIC_A)
    count_after_second = db.query(Observation).filter(Observation.message_id == "m-dup-1").count()

    assert r1.accepted and r2.accepted
    assert r2.duplicate is True
    assert count_after_first == 3
    assert count_after_second == 3  # 重复不产生新观测
    assert db.get(ProcessedMessage, "m-dup-1").duplicate_count == 1
    db.close()


def test_invalid_json_goes_to_dead_letter():
    db = SessionLocal()
    out = process_observation_payload(db, "{not json", TOPIC_A)
    assert not out.accepted and out.reason == "INVALID_JSON"
    err = (
        db.query(IngestionError)
        .filter(IngestionError.reason == "INVALID_JSON")
        .order_by(IngestionError.error_id.desc())
        .first()
    )
    assert err is not None and "{not json" in (err.raw_payload or "")
    db.close()


def test_schema_violation_rejected():
    db = SessionLocal()
    # 缺 observedAt
    bad = json.dumps(
        {
            "messageId": "m-bad-1",
            "reachId": "reach-a",
            "metrics": {"waterLevel": {"value": 1, "unit": "m"}},
        }
    )
    out = process_observation_payload(db, bad, TOPIC_A)
    assert not out.accepted and out.reason == "SCHEMA_VIOLATION"
    assert db.get(ProcessedMessage, "m-bad-1") is None
    db.close()


def test_unknown_reach_rejected():
    db = SessionLocal()
    raw = make_message("m-bad-2", datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc), reachId="reach-z")
    out = process_observation_payload(db, raw, "tidewatch/v1/reach-z/observation")
    assert not out.accepted and out.reason == "UNKNOWN_REACH"
    db.close()


def test_topic_payload_reach_mismatch_rejected():
    db = SessionLocal()
    raw = make_message("m-bad-3", datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc), reachId="reach-b")
    out = process_observation_payload(db, raw, TOPIC_A)
    assert not out.accepted and out.reason == "TOPIC_MISMATCH"
    db.close()


def test_unit_mismatch_and_out_of_range_rejected():
    db = SessionLocal()
    base_time = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)

    bad_unit = make_message("m-bad-4", base_time)
    payload = json.loads(bad_unit)
    payload["metrics"]["waterLevel"]["unit"] = "cm"
    out = process_observation_payload(db, json.dumps(payload), TOPIC_A)
    assert not out.accepted and out.reason == "UNIT_MISMATCH"

    bad_range = make_message("m-bad-5", base_time + timedelta(minutes=1))
    payload = json.loads(bad_range)
    payload["metrics"]["waterLevel"]["value"] = 1000
    out = process_observation_payload(db, json.dumps(payload), TOPIC_A)
    assert not out.accepted and out.reason == "OUT_OF_RANGE"
    db.close()


def test_late_data_does_not_rollback_last_seen():
    db = SessionLocal()
    t_new = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
    t_old = datetime(2026, 10, 21, 8, 0, tzinfo=timezone.utc)  # 4 小时前的迟到数据
    process_observation_payload(db, make_message("m-late-new", t_new), TOPIC_A)
    process_observation_payload(db, make_message("m-late-old", t_old), TOPIC_A)

    reach = db.get(Reach, "reach-a")
    last = reach.last_seen_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    # Current Fact 不被旧消息覆盖
    assert last >= t_new

    # 旧观测仍按 observedAt 入库，时间线可重建
    old_rows = (
        db.query(Observation)
        .filter(Observation.message_id == "m-late-old")
        .order_by(Observation.observed_at)
        .all()
    )
    assert len(old_rows) == 3
    db.close()


def test_notifier_called_with_snapshot():
    events: list[tuple[str, dict, str | None]] = []

    def notify(t, p, s):
        events.append((t, p, s))

    db = SessionLocal()
    process_observation_payload(
        db,
        make_message("m-notify-1", datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)),
        TOPIC_A,
        notifier=notify,
    )
    assert len(events) == 1
    mtype, payload, scenario = events[0]
    assert mtype == "observation.created"
    assert scenario == "S1"
    assert payload["reachId"] == "reach-a"
    assert set(payload["metrics"].keys()) == {"waterLevel", "turbidity", "flowLevel"}
    db.close()
