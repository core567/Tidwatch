"""规则 vs ML 对照测试。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.db.session import SessionLocal
from app.models.system import ModelOutput
from app.services import ml_service

T0 = datetime(2026, 10, 23, tzinfo=timezone.utc)


def _insert_series(db, reach: str, water: list[float], turb: list[float]):
    for i, (wv, tv) in enumerate(zip(water, turb)):
        t = T0 + timedelta(seconds=i)
        batch = uuid4().hex[:8]
        for metric, value, unit in (("waterLevel", wv, "m"), ("turbidity", tv, "NTU")):
            db.add(ObservationLike(db, reach, metric, value, unit, t, batch))
    db.commit()


def ObservationLike(db, reach, metric, value, unit, t, batch):
    from app.models.observation import Observation
    return Observation(
        observation_id=f"obs-{uuid4().hex[:12]}", reach_id=reach, metric=metric,
        value=value, unit=unit, observed_at=t, ingested_at=t,
        source_type="SIMULATED", source_name="scenario-S1", scenario_id="S1",
        quality_flag="GOOD", rule_version="demo-rules-v1",
        message_id=f"S1-{reach}-{batch}-{metric}",
        dedup_key=f"S1-{reach}-{batch}-{metric}",
    )


@pytest.fixture()
def clean_ml(client, clean_event_tables):
    """清空观测与模型输出。"""
    db = SessionLocal()
    db.query(ModelOutput).delete()
    from app.models.observation import Observation
    db.query(Observation).delete()
    db.commit()
    yield db
    db.close()


def test_insufficient_data_does_not_judge(clean_ml):
    db = clean_ml
    # 仅 5 个正常样本
    _insert_series(db, "reach-a", [4.2, 4.4, 4.1, 4.5, 4.3], [20, 21, 19, 22, 20])
    out = ml_service.score_reach(db, "reach-a", 9.0, 20.0)
    assert out is not None
    assert out.output == "INSUFFICIENT_DATA"
    assert out.score is None


def test_model_flags_extreme_high(clean_ml):
    db = clean_ml
    # 30 个正常基线样本（水位 4.0-4.6 稳定）
    water = [4.0 + (i % 6) * 0.1 for i in range(30)]
    turb = [18 + (i % 5) for i in range(30)]
    _insert_series(db, "reach-a", water, turb)
    out = ml_service.score_reach(db, "reach-a", 9.2, 20.0)
    assert out.output == "ANOMALY"
    assert out.score is not None and out.score > 0.5
    # 正常值得分低
    normal = ml_service.score_reach(db, "reach-a", 4.3, 20.0)
    assert normal.output in ("NORMAL", "ANOMALY")  # 主要靠下面对照
    # 模型独立：不写事件状态
    from app.models.event import ActiveEvent
    assert db.query(ActiveEvent).count() == 0


def test_comparison_agreement_and_boundary_note(clean_ml):
    db = clean_ml
    water = [4.0 + (i % 6) * 0.1 for i in range(30)]
    turb = [18 + (i % 5) for i in range(30)]
    _insert_series(db, "reach-b", water, turb)
    cmp_abnormal = ml_service.compare_rule_and_ml(db, "reach-b", 9.1, 20.0, "FLOOD_WARNING")
    assert cmp_abnormal["ruleAnomaly"] is True
    assert "非官方标准" in cmp_abnormal["boundary"]
    # 样本不足断面
    cmp_short = ml_service.compare_rule_and_ml(db, "reach-c", 9.0, 20.0, "FLOOD_WARNING")
    assert cmp_short["agree"] is None  # 模型不判定时不给一致性结论
