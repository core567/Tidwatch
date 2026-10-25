"""规则化恢复评估（只读、幂等、不改变事件状态）。

依据可追溯记录（任务复核、状态迁移、观测、证据、盲区）对事件是否"证据支持恢复"
给出三态结论与因子依据。仅输出事实与规则判断，绝不执行任何状态迁移。
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.event import ActiveEvent, EventStatusTransition
from app.models.focus import BlindSpot
from app.models.observation import Observation
from app.models.workflow import (
    InspectionTask,
    TaskReview,
    TaskSubmission,
)

# ---- 可调参数（教学/演示口径，写入 ruleVersion） ----
RULE_VERSION = "recovery-rules-v1"
BASELINE_WINDOW = timedelta(minutes=60)
POST_WINDOW = timedelta(minutes=60)
MIN_SAMPLES = 3
MAX_EXCEED_RATIO = 0.20  # POST 窗越限点占比阈值
# 回落比例：POST 中位数相对异常峰值至少回落 50%（朝基线方向）
RECOVER_RATIO = 0.5

# 参与恢复判定的模拟指标（仅 MQTT 模拟连续序列）
TRACKED_METRICS = ("waterLevel", "turbidity", "flowLevel")

RECOVERED_SUPPORTED = "RECOVERED_SUPPORTED"
NEEDS_OBSERVATION = "NEEDS_OBSERVATION"
INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"

RESULT_LABEL = {
    RECOVERED_SUPPORTED: "证据支持恢复",
    NEEDS_OBSERVATION: "仍需观察",
    INSUFFICIENT_EVIDENCE: "证据不足、无法判断",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


@dataclass
class _Window:
    reach_id: str
    metric: str
    phase: str
    start: datetime | None
    end: datetime | None
    sample_count: int
    median: float | None
    mean: float | None
    p05: float | None
    p95: float | None
    unit: str
    source_type: str
    bad_quality: int
    exceed_ratio: float | None = None


def _window_stats(
    db: Session,
    reach_id: str,
    metric: str,
    start: datetime | None,
    end: datetime | None,
    phase: str,
) -> _Window:
    unit = "m" if metric == "waterLevel" else ("NTU" if metric == "turbidity" else "级")
    if start is None or end is None or end <= start:
        return _Window(reach_id, metric, phase, start, end, 0, None, None, None, None,
                        unit, "SIMULATED", 0)
    rows = list(db.execute(
        select(Observation).where(
            Observation.reach_id == reach_id,
            Observation.metric == metric,
            Observation.observed_at >= start,
            Observation.observed_at <= end,
        ).order_by(Observation.observed_at.asc())
    ).scalars())
    bad = sum(1 for r in rows if r.quality_flag not in ("GOOD", None))
    good = [float(r.value) for r in rows if r.quality_flag in ("GOOD", None)]
    if not good:
        return _Window(reach_id, metric, phase, _aware(start), _aware(end), 0, None, None,
                        None, None, unit, "SIMULATED", bad)
    med = statistics.median(good)
    mean = statistics.mean(good)
    srt = sorted(good)
    p05 = srt[max(0, int(round(0.05 * (len(srt) - 1))))]
    p95 = srt[min(len(srt) - 1, int(round(0.95 * (len(srt) - 1))))]
    return _Window(reach_id, metric, phase, _aware(start), _aware(end), len(good),
                    med, mean, p05, p95, unit, "SIMULATED", bad)


def _serialize_window(w: _Window, threshold: float | None = None, peak: float | None = None) -> dict:
    return {
        "reachId": w.reach_id,
        "metric": w.metric,
        "phase": w.phase,
        "start": w.start.isoformat() if w.start else None,
        "end": w.end.isoformat() if w.end else None,
        "sampleCount": w.sample_count,
        "median": round(w.median, 3) if w.median is not None else None,
        "mean": round(w.mean, 3) if w.mean is not None else None,
        "p05": round(w.p05, 3) if w.p05 is not None else None,
        "p95": round(w.p95, 3) if w.p95 is not None else None,
        "unit": w.unit,
        "sourceType": w.source_type,
        "badQuality": w.bad_quality,
        "exceedRatio": round(w.exceed_ratio, 3) if w.exceed_ratio is not None else None,
        "threshold": threshold,
        "anomalyPeak": round(peak, 3) if peak is not None else None,
    }


def _metrics_with_any_data(db, reach_id, start, end) -> set[str]:
    """该断面在评估时间范围内出现过观测的跟踪指标集合。"""
    rows = db.execute(
        select(Observation.metric).where(
            Observation.reach_id == reach_id,
            Observation.metric.in_(TRACKED_METRICS),
            Observation.observed_at >= start,
            Observation.observed_at <= end,
        ).distinct()
    ).scalars().all()
    return set(rows)


def _window_exceed_ratio(db, reach_id, metric, start, end, lo, hi) -> float:
    """窗口内越出容差带 [lo,hi] 的 GOOD 点占比。"""
    rows = list(db.execute(
        select(Observation.value, Observation.quality_flag).where(
            Observation.reach_id == reach_id,
            Observation.metric == metric,
            Observation.observed_at >= start,
            Observation.observed_at <= end,
        )
    ).all())
    good = [float(r[0]) for r in rows if r[1] in ("GOOD", None)]
    if not good:
        return 1.0
    out = sum(1 for v in good if v < lo or v > hi)
    return out / len(good)


def assess_recovery(db: Session, event_id: str) -> dict:
    event = db.get(ActiveEvent, event_id)
    if event is None:
        raise NotFoundError("活动事件", event_id)

    factors: list[dict] = []

    def factor(code: str, passed: bool | None, weight: str, detail: str, sources=None):
        factors.append({
            "code": code,
            "passed": passed,          # True 通过 / False 否决 / None 信息不足
            "weight": weight,
            "detail": detail,
            "sources": sources or [],
        })

    scope = _latest_scope(db, event_id)
    tasks = list(db.execute(
        select(InspectionTask).where(InspectionTask.event_id == event_id)
    ).scalars())
    task_ids = [t.task_id for t in tasks]

    # ---- F1 处置完成可追溯锚点 ----
    approved_at, approved_review = _latest_approved_review(db, task_ids)
    transition_anchor = _recovery_transition_time(db, event_id)
    anchor = approved_at or transition_anchor
    anchor_source = (
        "task_review.approved" if approved_at else
        ("event_status_transition" if transition_anchor else None)
    )
    if approved_at:
        f1_detail = f"以人工复核通过时间为锚点（{approved_at:%Y-%m-%d %H:%M}，复核人 {approved_review}）；该时间是复核时间，不等同推定的实际处置完成时刻。"
    elif transition_anchor:
        f1_detail = f"无 APPROVED 复核，采用进入恢复相关状态的迁移时间（{transition_anchor:%Y-%m-%d %H:%M}）作为替代锚点。"
    else:
        f1_detail = "无 APPROVED 复核，也无恢复相关状态迁移，处置完成时间锚点缺失。"
    factor("F1_ANCHOR", anchor is not None, "hard", f1_detail,
           [anchor_source] if anchor_source else [])

    # ---- F4 现场复核闭环（先算，供结论使用） ----
    latest_sub = _latest_submission(db, task_ids)
    review_decision = approved_review  # 是否存在 APPROVED
    open_review = _has_open_submission(db, task_ids)
    if approved_at:
        f4_pass, f4_detail = True, "最新提交已 PC 复核通过（APPROVED）。"
    elif open_review:
        f4_pass, f4_detail = False, "存在待复核或退回中的提交，现场复核未闭环。"
    elif latest_sub is None:
        f4_pass, f4_detail = None, "尚无现场提交记录。"
    else:
        f4_pass, f4_detail = False, "有现场提交但未复核通过。"
    factor("F4_REVIEW_CLOSED", f4_pass, "high", f4_detail)

    # ---- F6 证据完整性 ----
    from app.models.evidence import Evidence
    manual_evidence = db.execute(
        select(Evidence).where(Evidence.event_id == event_id, Evidence.type == "MANUAL")
    ).scalars().all()
    has_field = latest_sub is not None or bool(manual_evidence)
    factor("F6_FIELD_EVIDENCE", has_field if has_field else None, "medium",
           "存在现场提交/人工证据。" if has_field else "缺少现场提交与人工证据。",
           ["task_submissions", "evidence"])

    # ---- F5 无开放盲区 ----
    open_blind = list(db.execute(
        select(BlindSpot).where(BlindSpot.event_id == event_id, BlindSpot.end_at.is_(None))
    ).scalars())
    factor("F5_NO_OPEN_BLINDSPOT", len(open_blind) == 0, "high",
           "范围内无未消除监测盲区。" if not open_blind
           else f"存在 {len(open_blind)} 个未消除盲区：{', '.join(b.reach_id for b in open_blind)}。",
           ["blind_spots"])

    # ---- F2/F3/F7 观测窗口（有锚点才算） ----
    windows: list[dict] = []
    f2_pass: bool | None = None
    f3_pass: bool | None = None
    f7_pass: bool | None = None
    f2_detail = "无处置锚点，未计算处置后观测回落。"
    f3_detail = "无处置锚点，未评估样本量。"
    f7_detail = "无处置锚点，未评估持续性。"

    if anchor is not None:
        first_seen = _aware(event.first_seen_at)
        baseline_start = (first_seen - BASELINE_WINDOW) if first_seen else None
        trigger_metrics = _trigger_metrics(db, event_id)

        # 只评估各断面“实际有观测”的指标，避免未接入指标导致误判证据不足
        scope_metrics: list[tuple[str, str]] = []
        for reach in scope:
            have = _metrics_with_any_data(db, reach, baseline_start, anchor + POST_WINDOW)
            ordered = trigger_metrics + [m for m in TRACKED_METRICS if m not in trigger_metrics]
            picked = [m for m in ordered if m in have]
            for metric in picked:
                scope_metrics.append((reach, metric))

        f2_ok, f3_ok, f7_ok, insufficient = True, True, True, len(scope_metrics) == 0
        per_metric_evals = []
        if len(scope_metrics) == 0:
            per_metric_evals.append("范围内无任何可用于评估的模拟观测指标")
        for reach, metric in scope_metrics:
            base = _window_stats(db, reach, metric, baseline_start, first_seen, "BASELINE")
            anom = _window_stats(db, reach, metric, first_seen, anchor, "ANOMALY")
            post = _window_stats(db, reach, metric, anchor, anchor + POST_WINDOW, "POST")
            post_d = _serialize_window(post)
            windows += [_serialize_window(base), _serialize_window(anom), post_d]

            if post.sample_count < MIN_SAMPLES:
                insufficient = True
                f2_ok, f7_ok = False, False
                per_metric_evals.append(f"{reach}/{metric} 处置后有效样本 {post.sample_count}<{MIN_SAMPLES}")
                continue
            if base.sample_count < MIN_SAMPLES:
                insufficient = True
                per_metric_evals.append(f"{reach}/{metric} 基线样本不足")
                continue
            # 基线带 P05–P95 + 容差（避免正常噪声导致误判；教学口径）
            margin = max(
                ((base.p95 - base.p05) / 2) if base.p05 is not None and base.p95 is not None else 0,
                abs(base.median or 0) * 0.08,
                0.05,
            )
            lo = (base.p05 - margin) if base.p05 is not None else None
            hi = (base.p95 + margin) if base.p95 is not None else None
            peak = anom.median
            back_in_band = (lo is not None and hi is not None and post.median is not None
                            and lo <= post.median <= hi)
            ratio = _window_exceed_ratio(
                db, reach, metric, anchor, anchor + POST_WINDOW, lo, hi
            )
            post_d["exceedRatio"] = round(ratio, 3)
            post_d["threshold"] = [round(lo, 3), round(hi, 3)]
            post_d["anomalyPeak"] = round(peak, 3) if peak is not None else None
            if not back_in_band:
                f2_ok = False
                per_metric_evals.append(f"{reach}/{metric} 处置后中位数 {post.median} 未回到容差带 [{lo:.2f},{hi:.2f}]")
            if peak is not None and post.median is not None and base.median is not None:
                peak_dev = abs(peak - base.median)
                post_dev = abs(post.median - base.median)
                if peak_dev > 1e-9 and post_dev / peak_dev > (1 - RECOVER_RATIO):
                    f2_ok = False
                    per_metric_evals.append(f"{reach}/{metric} 相对异常峰值回落不足")
            if ratio > MAX_EXCEED_RATIO:
                f7_ok = False
                per_metric_evals.append(f"{reach}/{metric} 处置后越限占比 {ratio:.0%} 偏高")

        f3_pass = not insufficient
        f3_detail = ("处置后各断面指标有效样本≥%d 且基线可建。" % MIN_SAMPLES) if f3_pass \
            else "样本不足：" + "；".join(per_metric_evals[:4])
        f2_pass = f2_ok if not insufficient else None
        f2_detail = "处置后观测中位数回到基线波动带且相对峰值回落。" if f2_ok else (
            "观测未稳定回到基线：" + "；".join(per_metric_evals[:4]) if f2_ok is False
            else "样本不足，无法判定回落。")
        f7_pass = f7_ok if not insufficient else None
        f7_detail = (f"处置后窗越限点占比≤{MAX_EXCEED_RATIO:.0%}。" if f7_ok
                     else "仍有反复越限，持续性不足。" if f7_ok is False
                     else "样本不足，无法评估持续性。")

    factor("F2_OBSERVATION_RETURN", f2_pass, "hard", f2_detail, ["observations"])
    factor("F3_SAMPLE_QUALITY", f3_pass, "hard", f3_detail, ["observations"])
    factor("F7_PERSISTENCE", f7_pass, "medium", f7_detail, ["observations"])

    # ---- 结论（规则优先级） ----
    hard = {f["code"]: f["passed"] for f in factors}
    if hard["F1_ANCHOR"] is False or hard["F3_SAMPLE_QUALITY"] is False or hard["F6_FIELD_EVIDENCE"] is not True:
        result = INSUFFICIENT_EVIDENCE
    elif hard["F2_OBSERVATION_RETURN"] is False or hard["F4_REVIEW_CLOSED"] is False \
            or hard["F5_NO_OPEN_BLINDSPOT"] is False or hard["F7_PERSISTENCE"] is False:
        result = NEEDS_OBSERVATION
    elif hard["F2_OBSERVATION_RETURN"] is True and hard["F4_REVIEW_CLOSED"] is True:
        result = RECOVERED_SUPPORTED
    else:
        result = INSUFFICIENT_EVIDENCE

    disclaimers = [
        "本评估为规则输出（%s），仅依据有效观测、现场复核与证据记录；不构成法定结论。" % RULE_VERSION,
        "评估只读，不改变事件状态；事件是否 RECOVERED 仍由状态机的合法人工操作决定。",
        "锚点若来自状态迁移时间或复核时间，仅表示可追溯的时间参考，不等同实测处置完成时刻。",
    ]
    return {
        "eventId": event_id,
        "result": result,
        "label": RESULT_LABEL[result],
        "evaluatedAt": _utcnow().isoformat(),
        "ruleVersion": RULE_VERSION,
        "currentStatus": event.status,
        "anchor": {
            "at": anchor.isoformat() if anchor else None,
            "source": anchor_source,
            "note": "复核时间，非推定处置完成时间" if anchor_source == "task_review.approved"
                    else ("恢复相关状态迁移时间" if anchor_source else "锚点缺失"),
        },
        "factors": factors,
        "windows": windows,
        "disclaimers": disclaimers,
    }


def _latest_scope(db: Session, event_id: str) -> list[str]:
    import json
    from app.models.event import EventScope
    raw = db.execute(
        select(EventScope.reaches_json)
        .where(EventScope.event_id == event_id)
        .order_by(EventScope.version.desc()).limit(1)
    ).scalar_one_or_none()
    return json.loads(raw or "[]")


def _latest_approved_review(db: Session, task_ids: list[str]):
    if not task_ids:
        return None, None
    r = db.execute(
        select(TaskReview).where(TaskReview.task_id.in_(task_ids), TaskReview.decision == "APPROVED")
        .order_by(TaskReview.reviewed_at.desc()).limit(1)
    ).scalar_one_or_none()
    return (_aware(r.reviewed_at), r.reviewer) if r else (None, None)


def _recovery_transition_time(db: Session, event_id: str) -> datetime | None:
    r = db.execute(
        select(EventStatusTransition.created_at)
        .where(
            EventStatusTransition.event_id == event_id,
            EventStatusTransition.to_status.in_(["RECOVERY_PENDING", "RECOVERED"]),
        ).order_by(EventStatusTransition.created_at.asc()).limit(1)
    ).scalar_one_or_none()
    return _aware(r)


def _latest_submission(db: Session, task_ids: list[str]):
    if not task_ids:
        return None
    return db.execute(
        select(TaskSubmission).where(TaskSubmission.task_id.in_(task_ids))
        .order_by(TaskSubmission.version.desc()).limit(1)
    ).scalar_one_or_none()


def _has_open_submission(db: Session, task_ids: list[str]) -> bool:
    if not task_ids:
        return False
    pending = db.execute(
        select(InspectionTask.status).where(
            InspectionTask.task_id.in_(task_ids),
            InspectionTask.status.in_(["SUBMITTED", "IN_PROGRESS", "PENDING", "ACCEPTED"]),
        ).limit(1)
    ).scalar_one_or_none()
    return pending is not None


def _trigger_metrics(db: Session, event_id: str) -> list[str]:
    """从触发信息取指标；trigger_json 不存在则回退跟踪指标全集。"""
    import json
    e = db.get(ActiveEvent, event_id)
    if e and getattr(e, "trigger_json", None):
        try:
            m = json.loads(e.trigger_json).get("metric")
            return [m] if m else []
        except Exception:
            return []
    return []
