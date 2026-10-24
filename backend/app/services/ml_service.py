"""轻量 ML 异常评分（与确定性规则并列，独立不驱动状态机）。

使用 IsolationForest 基于各断面历史正常观测（水位/浊度）训练，
对新观测输出 0-1 异常概率（contamination 对齐教学阈值）。
- 样本不足时不臆测，返回 INSUFFICIENT_DATA；
- 结果写入 model_outputs，只作为“模型建议”展示，规则才是研判依据。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.observation import Observation
from app.models.system import ModelOutput

MIN_TRAIN_SAMPLES = 20
MODEL_NAME = "isolation-forest-waterlevel-v1"
CONTAMINATION = 0.1


def _id() -> str:
    return f"mdl-{uuid.uuid4().hex[:16]}"


def _features(rows) -> np.ndarray:
    return np.array([[r[0], r[1]] for r in rows], dtype=float)


def score_reach(db: Session, reach_id: str, latest_water: float | None,
                latest_turb: float | None) -> ModelOutput | None:
    """用该断面历史正常样本训练并对当前值打分，持久化 ModelOutput。"""
    # 历史（水位/浊度配对，按观测时间对齐到同 message 的两条）
    wl_rows = db.execute(
        select(Observation.observed_at, Observation.value)
        .where(Observation.reach_id == reach_id, Observation.metric == "waterLevel")
        .order_by(Observation.observed_at)
    ).all()
    tu_rows = {
        at: v for at, v in db.execute(
            select(Observation.observed_at, Observation.value)
            .where(Observation.reach_id == reach_id, Observation.metric == "turbidity")
        ).all()
    }
    paired = [(wv, tu_rows[at]) for at, wv in wl_rows if at in tu_rows]
    # 仅用正常区间样本训练（教学规则下水位 < 7.0 视为基线）
    baseline = [p for p in paired if 3.0 <= p[0] < 7.0]

    if latest_water is None or latest_turb is None or len(baseline) < MIN_TRAIN_SAMPLES:
        return _persist(
            db, reach_id, latest_water, latest_turb,
            score=None, is_anomaly=False,
            state="INSUFFICIENT_DATA",
            note=f"基线样本 {len(baseline)} < {MIN_TRAIN_SAMPLES}，模型不判定",
        )

    from sklearn.ensemble import IsolationForest

    # 特征标准化（用基线均值/标准差），让两个量纲可比；极端高水位在小样本上也能稳定识别
    base = _features(baseline)
    mean = base.mean(axis=0)
    std = base.std(axis=0)
    std[std == 0] = 1.0
    clf = IsolationForest(contamination=CONTAMINATION, random_state=42)
    clf.fit((base - mean) / std)
    x = (np.array([[latest_water, latest_turb]], dtype=float) - mean) / std
    raw = clf.score_samples(x)[0]
    # 额外的稳健 z 分数：水位偏离基线均值超过 3 个标准差明确异常
    z_water = abs(latest_water - mean[0]) / std[0]
    score = float(1 / (1 + np.exp(raw * 1.5)))
    is_anomaly = bool(clf.predict(x)[0] == -1) or z_water >= 3.0

    return _persist(
        db, reach_id, latest_water, latest_turb,
        score=round(score, 4), is_anomaly=is_anomaly,
        state="ANOMALY" if is_anomaly else "NORMAL",
        note=f"IsolationForest（{len(baseline)} 基线样本），与 demo 规则独立",
    )


def _persist(db, reach_id, wl, tu, *, score, is_anomaly, state, note) -> ModelOutput:
    out = ModelOutput(
        output_id=_id(),
        model_version=MODEL_NAME,
        reach_id=reach_id,
        features_json=json.dumps(
            {"waterLevel": wl, "turbidity": tu, "note": note}, ensure_ascii=False
        ),
        output="ANOMALY" if is_anomaly else state,
        score=score,
        input_evidence_refs="[]",
        run_id=None,
    )
    db.add(out)
    return out


def compare_rule_and_ml(db: Session, reach_id: str, latest_water: float | None,
                        latest_turb: float | None, rule_status: str | None) -> dict:
    """规则与模型对照摘要（供 P06 展示）。"""
    m = score_reach(db, reach_id, latest_water, latest_turb)
    rule_anomaly = rule_status in ("FLOOD_WARNING", "WATER_LEVEL_WATCH", "TURBIDITY_HIGH")
    feature_note = ""
    if m is not None:
        try:
            feature_note = json.loads(m.features_json).get("note", "")
        except Exception:
            feature_note = ""
    return {
        "reachId": reach_id,
        "ruleStatus": rule_status,
        "ruleAnomaly": rule_anomaly,
        "mlState": m.output if m else "UNAVAILABLE",
        "mlScore": m.score if m else None,
        "agree": ((m.output == "ANOMALY") == rule_anomaly) if m and m.output not in ("INSUFFICIENT_DATA", "UNAVAILABLE") else None,
        "note": feature_note,
        "boundary": "教学阈值 9.0/8.5/60，非官方标准",
    }
