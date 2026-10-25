"""活动事件服务：把变化检测器的边沿信号落为事件业务对象。

职责（GRP 5）：
- confirmedNow → ChangeEvent + ActiveEvent（或扩展既有事件范围）+ 证据 + Run Trace；
- 跨断面变化 → TemporalRelation（只陈述观测先后，非因果）+ 下游 ObservationFocus；
- recoveredNow（恢复窗口已满足）→ RECOVERY_PENDING → RECOVERED；
- 所有状态迁移经 8 态状态机并留痕；前端只接收推送，不自行改状态。

检测器为进程内状态；后端重启时从最近观测重建（重建期不产生边沿，避免重复事件）。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models.base import utc_now
from app.models.evidence import Evidence
from app.models.event import (
    ActiveEvent,
    ChangeEvent,
    EventScope,
    EventStatusTransition,
    TemporalRelation,
)
from app.models.focus import ObservationFocus
from app.models.observation import Observation
from app.models.workflow import RunTrace
from app.models.reach import Reach
from app.rules.change_detection import ChangeDetector, Sample
from app.rules.state_machine import EventAction, IllegalTransition, next_status
from app.rules.thresholds import EnvStatus

logger = get_logger("event-service")

# 跨断面时序关联窗口（按观测时间）：两个断面在此时长内先后确认变化才建立关系
CORRELATION_WINDOW_SEC = 20 * 60
# 重建检测器使用的历史样本数
REBUILD_SAMPLES = 60

_EVENT_TYPE = {
    EnvStatus.FLOOD_WARNING: "WATER_LEVEL_ALERT",
    EnvStatus.WATER_LEVEL_WATCH: "WATER_LEVEL_ALERT",
    EnvStatus.TURBIDITY_HIGH: "TURBIDITY_SUDDEN_CHANGE",
}
_DOWNSTREAM = {"reach-a": "reach-b", "reach-b": "reach-c"}


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def _aware(dt: datetime) -> datetime:
    """SQLite 取回的时间可能缺 tzinfo，统一按 UTC。"""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _utc(dt: datetime) -> datetime:
    """统一转 UTC（消除 +08:00 与 naive 混用导致的时间差错误）。"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class EventProcessor:
    """持有各断面检测器，并在边沿发生时写库。"""

    def __init__(self) -> None:
        self._detectors: dict[str, ChangeDetector] = {}
        # event_id -> 已恢复断面集合（进程内运行态，配合检测器使用）
        self._recovered: dict[str, set[str]] = {}

    def _detector(self, reach_id: str) -> ChangeDetector:
        if reach_id not in self._detectors:
            self._detectors[reach_id] = ChangeDetector()
        return self._detectors[reach_id]

    # ---------- 重启重建 ----------

    def rebuild_from_history(self, db: Session) -> None:
        reaches = [r.reach_id for r in db.execute(select(Reach)).scalars()]
        for reach_id in reaches:
            wl = self._series(db, reach_id, "waterLevel")
            tu = self._series(db, reach_id, "turbidity")
            merged = sorted(wl.keys() | tu.keys())
            if not merged:
                continue
            detector = self._detector(reach_id)
            for ts in merged[-REBUILD_SAMPLES:]:
                detector.add(
                    Sample(
                        observed_at=ts,
                        water_level=wl.get(ts, 4.5),
                        turbidity=tu.get(ts, 20.0),
                    )
                )
        logger.info("change detectors rebuilt from history for %d reaches", len(reaches))

    @staticmethod
    def _series(db: Session, reach_id: str, metric: str) -> dict[float, float]:
        rows = db.execute(
            select(Observation)
            .where(Observation.reach_id == reach_id, Observation.metric == metric)
            .order_by(Observation.observed_at.desc())
            .limit(REBUILD_SAMPLES)
        ).scalars()
        return {r.observed_at.timestamp(): r.value for r in rows}

    # ---------- 主入口 ----------

    def process_sample(
        self,
        db: Session,
        reach_id: str,
        observed_at: datetime,
        water_level: float | None,
        turbidity: float | None,
        scenario_id: str | None,
        observation_ids: list[str],
        notifier=None,
    ) -> ActiveEvent | None:
        if water_level is None or turbidity is None:
            return None
        observed_at = _utc(observed_at)
        detector = self._detector(reach_id)
        result = detector.add(
            Sample(observed_at.timestamp(), water_level, turbidity)
        )
        event: ActiveEvent | None = None
        if result.confirmed_now:
            event = self._on_confirmed(
                db, reach_id, result, observed_at, scenario_id, observation_ids, notifier
            )
        elif result.confirmed:
            # 已确认异常的后续异常样本：追加到当前事件（不计新 ChangeEvent，避免噪声）
            event = self._active_event_for(db, reach_id, result.status)
        if result.recovered_now:
            self._on_recovered(db, reach_id, observed_at, notifier)
        if result.status is EnvStatus.NORMAL:
            # 该断面可能是某事件的未决 Focus（如 S5 中一直正常的 C）：
            # 正常样本到达时也检查一次事件是否可整体恢复
            if not result.recovered_now:
                self._on_recovered(db, reach_id, observed_at, notifier)
            # S4：关键观察点在关联窗口内持续稳定 → 传播假设反证、关闭 Focus
            self._evaluate_focus_window(db, reach_id, observed_at, notifier)
        return event

    def _evaluate_focus_window(self, db, reach_id: str, observed_at: datetime, notifier) -> None:
        """该断面作为某事件的观察重点且持续正常：窗口到期则判定不支持扩展。"""
        from app.services import assessment_service, evidence_service

        focus = db.execute(
            select(ObservationFocus).where(
                ObservationFocus.reach_id == reach_id,
                ObservationFocus.status == "ACTIVE",
            )
        ).scalars().first()
        if focus is None:
            return
        event = db.get(ActiveEvent, focus.event_id)
        if event is None:
            return
        elapsed = (_aware(observed_at) - _aware(event.first_seen_at)).total_seconds()
        if elapsed < CORRELATION_WINDOW_SEC:
            return  # 观察窗口未到，继续等
        # 窗口到期且当前正常：形成缺失/反证，关闭 Focus，降级假设
        focus.status = "RESOLVED"
        focus.resolved_at = observed_at
        evidence_service.add_evidence(
            db, event.event_id, type="OBSERVATION", source_ref=f"focus:{reach_id}",
            polarity="COUNTER",
            note=f"{reach_id} 在观察窗口内保持稳定，未出现同向变化",
            created_by="SYSTEM", observed_at=observed_at,
        )
        downgraded = assessment_service.downgrade_unsupported_hypotheses(db, event.event_id)
        scope = json.loads(self._latest_scope(db, event.event_id))
        assessment_service.create_assessment(
            db, event.event_id, scope, scope,
            reason=f"{reach_id} 窗口内稳定，事件不向该断面扩展，传播假设不支持",
            hypothesis_snapshot=[{"hypothesisId": h, "state": "NOT_SUPPORT"} for h in downgraded],
            warnings=[f"{reach_id} 无同向变化证据"],
            trigger_reason="focus.window_expired",
        )
        db.commit()
        if notifier:
            notifier("focus.resolved", {"eventId": event.event_id, "reachId": reach_id}, None)

    # ---------- 确认变化 ----------

    def _on_confirmed(
        self, db, reach_id, result, observed_at, scenario_id, observation_ids, notifier
    ) -> ActiveEvent:
        # 找同类型、在跨断面关联窗口内首发的活动事件归入；否则新建
        existing = self._correlatable_event(db, result.status, observed_at)
        is_new_event = existing is None
        if is_new_event:
            event = self._create_event(db, reach_id, result.status, observed_at, scenario_id)
        else:
            event = existing

        change = ChangeEvent(
            change_id=_id("chg"),
            reach_id=reach_id,
            metric="waterLevel" if "WATER" in _EVENT_TYPE[result.status] else "turbidity",
            window_start=_utc(datetime.fromtimestamp(result.started_at or observed_at.timestamp(),
                                                tz=timezone.utc)),
            window_end=_utc(observed_at),
            baseline=None,
            magnitude=result.abnormal_run,
            direction="UP",
            rule_id=settings.rule_version,
            event_id=event.event_id,
            observation_ids=json.dumps(observation_ids),
        )
        db.add(change)
        db.flush()

        db.add(Evidence(
            evidence_id=_id("evi"),
            event_id=event.event_id,
            type="OBSERVATION",
            source_ref=change.change_id,
            polarity="SUPPORT",
            quality_flag="GOOD",
            note=f"{reach_id} 连续 {result.abnormal_run} 个采样点判级为 {result.status.value}",
            created_by="SYSTEM",
            observed_at=observed_at,
        ))
        db.flush()
        evidence = db.query(Evidence).filter(
            Evidence.source_ref == change.change_id
        ).one()

        is_new_reach = reach_id not in json.loads(self._latest_scope(db, event.event_id))
        self._recovered.setdefault(event.event_id, set()).discard(reach_id)

        # 范围扩展
        scope = [r for r in json.loads(self._latest_scope(db, event.event_id))]
        scope_before = list(scope)
        if is_new_reach:
            scope.append(reach_id)
            scope = self._topo_sorted(db, scope)
            event.version += 1
            self._write_scope(db, event, scope, f"{reach_id} 出现同向持续变化，范围扩展")
            # 被纳入范围的断面，其既有观察重点应关闭
            for focus in db.execute(
                select(ObservationFocus).where(
                    ObservationFocus.event_id == event.event_id,
                    ObservationFocus.reach_id == reach_id,
                    ObservationFocus.status == "ACTIVE",
                )
            ).scalars():
                focus.status = "RESOLVED"
                focus.resolved_at = observed_at
            self._auto_focus(db, event, scope, observed_at, notifier)
            self._relate_to_previous(db, event, change, observed_at)

        # 再评估：新事件初始化假设+v1；后续断面扩展生成新版本
        from app.services import assessment_service
        if is_new_event:
            self._init_reasoning(db, event, change, evidence, scope, observed_at)
        elif scope_before != scope:
            assessment_service.create_assessment(
                db, event.event_id, scope_before, scope,
                reason=f"{reach_id} 同向持续变化，范围扩展至 {len(scope)} 个断面",
                trigger_reason="change.confirmed",
            )

        db.add(RunTrace(
            trace_id=_id("trc"),
            event_id=event.event_id,
            actor="SYSTEM",
            action="change.confirmed",
            input_refs=json.dumps(observation_ids),
            output_refs=json.dumps([change.change_id]),
            rule_version=settings.rule_version,
            detail=f"{reach_id} 确认持续异常 {result.status.value}",
        ))
        db.commit()

        if notifier:
            notifier("change.detected", {
                "eventId": event.event_id, "changeId": change.change_id,
                "reachId": reach_id, "status": result.status.value,
            }, scenario_id)
            notifier("event.updated", {"eventId": event.event_id, "version": event.version,
                                       "scopeReachIds": scope}, scenario_id)
        return event

    def _create_event(self, db, reach_id, status: EnvStatus, observed_at, scenario_id) -> ActiveEvent:
        seq = db.query(ActiveEvent).count() + 1
        event = ActiveEvent(
            event_id=f"TW-{seq:03d}",
            title=f"{self._status_cn(status)}：{reach_id} 出现持续异常",
            event_type=_EVENT_TYPE[status],
            status="OPEN",
            priority="HIGH" if status is EnvStatus.FLOOD_WARNING else "NORMAL",
            first_seen_at=observed_at,
            version=1,
            rule_version=settings.rule_version,
        )
        db.add(event)
        db.flush()
        self._record_transition(db, event, None, "OPEN", "RULE", "首次识别持续变化", observed_at)
        # 自动进入调查（GRP：初始变化被识别）
        self._transition(db, event, EventAction.START_INVESTIGATION, "RULE",
                         "连续异常采样确认，建立活动事件", observed_at)
        self._write_scope(db, event, [reach_id], "事件建立，范围为首发断面")
        db.flush()
        return event

    def _init_reasoning(self, db, event: ActiveEvent, first_change: ChangeEvent,
                        first_evidence: Evidence, scope: list[str], observed_at) -> None:
        """事件首次确认：建立待验证假设与 v1 再评估。"""
        from app.models.evidence import Hypothesis
        from app.services import assessment_service
        from app.services import evidence_service

        downstream = "reach-b" if "reach-a" in scope else "reach-c" if "reach-b" in scope else None
        statement = (
            f"{scope[0]} 的持续异常将沿河道向下游传播，{downstream} 可能出现同向变化"
            if downstream else "异常范围可能扩大"
        )
        h = Hypothesis(
            hypothesis_id=_id("hyp"),
            event_id=event.event_id,
            statement=statement,
            state="OPEN",
            support_refs=json.dumps([first_evidence.evidence_id]),
            counter_refs="[]",
            run_id=None,
        )
        db.add(h)
        db.flush()
        assessment_service.create_assessment(
            db, event.event_id, [], scope,
            hypothesis_snapshot=[{
                "hypothesisId": h.hypothesis_id, "state": "OPEN",
                "support": 1, "counter": 0,
            }],
            reason=f"事件建立，首发断面 {scope[0]}",
            task_suggestions=[f"CONTINUE_OBSERVE:{downstream}"] if downstream else [],
            trigger_reason="change.confirmed",
        )

    def _relate_to_previous(self, db, event, change, observed_at) -> None:
        """与事件内更早断面的变化建立时序关系（仅 OBSERVED_SEQUENCE，非因果）。"""
        prev = db.execute(
            select(ChangeEvent)
            .where(ChangeEvent.event_id == event.event_id, ChangeEvent.change_id != change.change_id)
            .order_by(ChangeEvent.window_end.asc())
        ).scalars().first()
        if prev is None:
            return
        delta = (_aware(change.window_end) - _aware(prev.window_end)).total_seconds()
        if not (0 < delta <= CORRELATION_WINDOW_SEC):
            return
        db.add(TemporalRelation(
            relation_id=_id("rel"),
            from_change_id=prev.change_id,
            to_change_id=change.change_id,
            delta_seconds=delta,
            relation_type="OBSERVED_SEQUENCE",
            evidence_state="OBSERVED_SEQUENCE",
        ))

    def _auto_focus(self, db, event, scope, observed_at, notifier=None) -> None:
        """A/B 已变化时，对下游未变化断面建立观察重点。"""
        focus_reach = None
        if "reach-a" in scope and "reach-b" in scope and "reach-c" not in scope:
            focus_reach = "reach-c"
        elif "reach-a" in scope and "reach-b" not in scope:
            focus_reach = "reach-b"
        if focus_reach is None:
            return
        exists = db.execute(
            select(ObservationFocus).where(
                ObservationFocus.event_id == event.event_id,
                ObservationFocus.reach_id == focus_reach,
                ObservationFocus.status == "ACTIVE",
            )
        ).scalar_one_or_none()
        if exists is None:
            focus = ObservationFocus(
                focus_id=_id("foc"),
                event_id=event.event_id,
                reach_id=focus_reach,
                reason="上游断面已出现同向持续变化，下游为下一观察重点（时序先后不构成因果证明）",
                status="ACTIVE",
            )
            db.add(focus)
            db.flush()
            # 同步派发巡检任务（默认分配 inspector）
            from app.services import task_service
            task = task_service.create_task(
                db,
                event_id=event.event_id,
                focus_id=focus.focus_id,
                reach_id=focus_reach,
                action_type=f"FOCUS_REACH_{focus_reach.split('-')[1].upper()}",
                title=f"现场核查 {focus_reach} 是否出现同向变化",
                priority="HIGH",
                reason=focus.reason,
                assignee="inspector",
            )
            if notifier:
                notifier(
                    "task.created",
                    {"taskId": task.task_id, "eventId": event.event_id,
                     "reachId": focus_reach, "status": task.status},
                    None,
                )

    # ---------- 恢复 ----------

    def _on_recovered(self, db, reach_id, observed_at, notifier) -> None:
        """某断面恢复正常：范围内全部断面当前不异常且无开放盲区才结束事件。"""
        from app.services import blindspot_service

        events = db.execute(
            select(ActiveEvent).where(ActiveEvent.status != "RECOVERED")
        ).scalars()
        for event in events:
            scope = json.loads(self._latest_scope(db, event.event_id))
            focus_reaches = [
                f.reach_id for f in db.execute(
                    select(ObservationFocus).where(
                        ObservationFocus.event_id == event.event_id,
                        ObservationFocus.status == "ACTIVE",
                    )
                ).scalars()
            ]
            # 断面在范围内，或为该事件未决 Focus（如 S5 的 C）
            if reach_id not in scope and reach_id not in focus_reaches:
                continue
            guard_reaches = list(set(scope) | set(focus_reaches))
            if blindspot_service.has_open_blind_spot(db, guard_reaches):
                db.add(RunTrace(
                    trace_id=_id("trc"),
                    event_id=event.event_id, actor="SYSTEM",
                    action="recovery.blocked_by_blindspot",
                    rule_version=settings.rule_version,
                    detail=f"{reach_id} 恢复，但监测盲区未消除，事件保持活动",
                ))
                db.commit()
                continue
            # 范围内所有断面的检测器当前都不再处于确认异常态 → 可恢复
            still_abnormal = [
                r for r in scope
                if self._detectors.get(r) is not None
                and self._detectors[r].is_currently_confirmed()
            ]
            if still_abnormal:
                db.add(RunTrace(
                    trace_id=_id("trc"),
                    event_id=event.event_id, actor="SYSTEM",
                    action="reach.recovered",
                    rule_version=settings.rule_version,
                    detail=f"{reach_id} 恢复，仍有 {still_abnormal} 异常",
                ))
                db.commit()
                continue
            self._finish_recovery(db, event, observed_at, notifier)

    def _finish_recovery(self, db, event, observed_at, notifier) -> None:
        self._transition(db, event, EventAction.MARK_RECOVERY_PENDING, "RULE",
                         "范围内全部断面连续正常且无盲区", observed_at)
        self._transition(db, event, EventAction.CONFIRM_RECOVERED, "RULE",
                         "恢复窗口确认", observed_at)
        db.add(RunTrace(
            trace_id=_id("trc"),
            event_id=event.event_id, actor="SYSTEM", action="event.recovered",
            input_refs=json.dumps([]), output_refs=json.dumps([]),
            rule_version=settings.rule_version,
            detail="范围内断面全部恢复，事件关闭",
        ))
        for focus in db.execute(
            select(ObservationFocus).where(
                ObservationFocus.event_id == event.event_id,
                ObservationFocus.status == "ACTIVE",
            )
        ).scalars():
            focus.status = "RESOLVED"
            focus.resolved_at = observed_at
        db.commit()
        self._recovered.pop(event.event_id, None)
        if notifier:
            notifier("event.status-changed",
                     {"eventId": event.event_id, "status": "RECOVERED"}, None)

    # ---------- 人工操作（P03） ----------

    def apply_manual_action(
        self, db, event_id: str, action: str, actor: str, reason: str | None
    ) -> ActiveEvent:
        event = db.get(ActiveEvent, event_id)
        if event is None:
            from app.core.errors import NotFoundError

            raise NotFoundError("活动事件", event_id)
        self._transition(db, event, action, "MANUAL", reason or "人工操作", utc_now(), actor)
        db.commit()
        return event

    # ---------- 工具 ----------

    def _transition(self, db, event: ActiveEvent, action, trigger, reason, at, actor="SYSTEM"):
        try:
            target = next_status(event.status, action)
        except IllegalTransition:
            from app.core.errors import ConflictError

            raise ConflictError(
                f"事件 {event.event_id} 当前状态 {event.status} 不允许 {action}",
                {"eventId": event.event_id, "status": event.status},
            )
        self._record_transition(db, event, event.status, target, trigger, reason, at, actor)
        event.status = target.value
        return target

    def _record_transition(self, db, event, from_status, to_status, trigger, reason, at, actor="SYSTEM"):
        db.add(EventStatusTransition(
            event_id=event.event_id,
            from_status=from_status if isinstance(from_status, str) or from_status is None
            else from_status.value,
            to_status=to_status if isinstance(to_status, str) else to_status.value,
            trigger=trigger,
            reason=reason,
            actor=actor,
            rule_version=settings.rule_version,
        ))
        from app.services import timeline_service
        timeline_service.record(
            db,
            biz_type=timeline_service.BIZ_EVENT,
            action_type="event.status-changed",
            event_ref=event.event_id,
            actor=actor,
            from_status=(from_status if isinstance(from_status, str) or from_status is None
                         else from_status.value),
            to_status=to_status if isinstance(to_status, str) else to_status.value,
            description=reason or f"{trigger} 状态迁移",
            occurred_at=at,
        )

    def _write_scope(self, db, event: ActiveEvent, reaches, reason):
        db.add(EventScope(
            event_id=event.event_id,
            version=event.version,
            reaches_json=json.dumps(reaches, ensure_ascii=False),
            change_reason=reason,
        ))

    def _latest_scope(self, db, event_id: str) -> str:
        scope = db.execute(
            select(EventScope.reaches_json)
            .where(EventScope.event_id == event_id)
            .order_by(EventScope.version.desc())
            .limit(1)
        ).scalar_one_or_none()
        return scope or "[]"

    def _topo_sorted(self, db, reach_ids: list[str]) -> list[str]:
        rows = db.execute(
            select(Reach).where(Reach.reach_id.in_(reach_ids))
        ).scalars()
        return [r.reach_id for r in sorted(rows, key=lambda r: r.topo_order)]

    def _active_event_for(self, db, reach_id: str, status: EnvStatus) -> ActiveEvent | None:
        """已确认异常的后续异常样本：找包含该断面的同类型活动事件。"""
        event_type = _EVENT_TYPE[status]
        active_statuses = (
            "OPEN", "INVESTIGATING", "MONITORING", "ESCALATED",
            "NARROWED", "RECOVERY_PENDING",
        )
        candidates = db.execute(
            select(ActiveEvent).where(
                ActiveEvent.event_type == event_type,
                ActiveEvent.status.in_(active_statuses),
            )
        ).scalars()
        for event in candidates:
            scope = json.loads(self._latest_scope(db, event.event_id))
            if reach_id in scope:
                return event
        return None

    def _correlatable_event(self, db, status: EnvStatus, observed_at: datetime) -> ActiveEvent | None:
        """新断面确认变化时：同类型活动事件且首发在关联窗口内，则归入（扩范围）。"""
        event_type = _EVENT_TYPE[status]
        active_statuses = (
            "OPEN", "INVESTIGATING", "MONITORING", "ESCALATED",
            "NARROWED", "RECOVERY_PENDING",
        )
        window_start = observed_at - timedelta(seconds=CORRELATION_WINDOW_SEC)
        candidates = db.execute(
            select(ActiveEvent).where(
                ActiveEvent.event_type == event_type,
                ActiveEvent.status.in_(active_statuses),
            ).order_by(ActiveEvent.first_seen_at.asc())
        ).scalars()
        # SQLite 时间可能缺 tzinfo，比较前统一补 UTC
        def aware(event_first_seen: datetime) -> datetime:
            return _aware(event_first_seen)

        for event in candidates:
            if aware(event.first_seen_at) >= window_start:
                return event
        return None

    @staticmethod
    def _status_cn(status: EnvStatus) -> str:
        return {
            EnvStatus.FLOOD_WARNING: "洪水预警",
            EnvStatus.WATER_LEVEL_WATCH: "高水位警戒",
            EnvStatus.TURBIDITY_HIGH: "水质浑浊",
        }.get(status, "异常")


# 单例
processor = EventProcessor()
