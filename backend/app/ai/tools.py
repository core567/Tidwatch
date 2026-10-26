"""AI 助手业务工具注册表（全部只读，复用现有 service）。

每个工具：
- name / description / 参数说明（供规则路由与未来大模型 function-calling 使用）
- run(db, **args) 返回 dict（含 data 与 sources：来源、时间、质量）
不提供任何写操作工具；派发/复核等只能由前端走既有业务接口并人工确认。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.models.event import ActiveEvent
from app.models.workflow import InspectionTask
from app.services import observation_service as obs_svc
from app.services import recovery_service, task_service
from app.models.focus import BlindSpot
from sqlalchemy import select


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _reach_latest(db: Session, reachId: str | None = None, **_: Any) -> dict:
    if not reachId:
        return {"error": "缺少断面参数 reachId"}
    rows = obs_svc.latest_per_metric(db, reachId)
    data = [
        {
            "metric": r.metric,
            "value": r.value,
            "unit": r.unit,
            "observedAt": r.observed_at.isoformat() if r.observed_at else None,
            "sourceType": r.source_type,
            "qualityFlag": r.quality_flag,
        }
        for r in rows
    ]
    return {
        "tool": "reach_latest",
        "reachId": reachId,
        "data": data,
        "sources": [{"type": "observation.latest", "reachId": reachId, "count": len(data)}],
        "generatedAt": _now(),
    }


def _list_events(db: Session, status: str | None = None, limit: int = 20, **_: Any) -> dict:
    q = select(ActiveEvent)
    if status and status not in ("ALL", ""):
        q = q.where(ActiveEvent.status == status)
    rows = list(db.execute(q.order_by(ActiveEvent.first_seen_at.desc()).limit(limit)).scalars())
    data = [
        {"eventId": e.event_id, "title": e.title, "status": e.status,
         "priority": e.priority, "firstSeenAt": e.first_seen_at.isoformat() if e.first_seen_at else None}
        for e in rows
    ]
    return {"tool": "list_events", "data": data, "sources": [{"type": "active_event"}], "generatedAt": _now()}


def _event_detail(db: Session, eventId: str | None = None, **_: Any) -> dict:
    if not eventId:
        return {"error": "缺少事件参数 eventId"}
    e = db.get(ActiveEvent, eventId)
    if not e:
        return {"error": f"事件不存在：{eventId}"}
    tasks = task_service.list_tasks(db, event_id=eventId)
    open_blind = list(db.execute(
        select(BlindSpot).where(BlindSpot.event_id == eventId, BlindSpot.end_at.is_(None))
    ).scalars())
    return {
        "tool": "event_detail",
        "eventId": eventId,
        "data": {
            "eventId": e.event_id,
            "title": e.title,
            "status": e.status,
            "priority": e.priority,
            "firstSeenAt": e.first_seen_at.isoformat() if e.first_seen_at else None,
            "tasks": [{"taskId": t.task_id, "status": t.status, "title": t.title} for t in tasks],
            "openBlindspots": [b.reach_id for b in open_blind],
        },
        "sources": [{"type": "active_event"}, {"type": "inspection_task"}],
        "generatedAt": _now(),
    }


def _list_tasks(db: Session, status: str | None = None, eventId: str | None = None, **_: Any) -> dict:
    # 助手默认不暴露草稿（与现场端一致）
    rows = task_service.list_tasks(db, status=(status or None), event_id=eventId)
    data = [
        {"taskId": t.task_id, "title": t.title, "status": t.status,
         "reachId": t.reach_id, "eventId": t.event_id,
         "createdAt": t.created_at.isoformat() if t.created_at else None}
        for t in rows
    ]
    return {"tool": "list_tasks", "data": data, "sources": [{"type": "inspection_task"}], "generatedAt": _now()}


def _recovery(db: Session, eventId: str | None = None, **_: Any) -> dict:
    if not eventId:
        return {"error": "缺少事件参数 eventId"}
    result = recovery_service.assess_recovery(db, eventId)
    return {"tool": "recovery_assessment", "eventId": eventId, "data": result,
            "sources": [{"type": "recovery_rules", "version": result.get("ruleVersion")}],
            "generatedAt": _now()}


def _anomalies(db: Session, **_: Any) -> dict:
    """当前存在异常的断面：活动事件范围 ∪ 陈旧/离线断面。"""
    events = list(db.execute(
        select(ActiveEvent).where(ActiveEvent.status.in_(["OPEN", "INVESTIGATING", "ESCALATED", "MONITORING", "NARROWED"]))
    ).scalars())
    reaches: dict[str, list[str]] = {}
    import json as _json
    from app.models.event import EventScope
    for e in events:
        scope = db.execute(
            select(EventScope.reaches_json)
            .where(EventScope.event_id == e.event_id)
            .order_by(EventScope.version.desc()).limit(1)
        ).scalar_one_or_none()
        for rid in (_json.loads(scope) if scope else []):
            reaches.setdefault(rid, []).append(e.event_id)
    data = [{"reachId": r, "events": evs} for r, evs in reaches.items()]
    return {"tool": "anomalies", "data": data, "sources": [{"type": "active_event.scope"}], "generatedAt": _now()}


ToolFn = Callable[..., dict]


class Tool:
    def __init__(self, name: str, description: str, fn: ToolFn, required: tuple[str, ...] = ()):
        self.name = name
        self.description = description
        self.fn = fn
        self.required = required


REGISTRY: dict[str, Tool] = {
    t.name: t
    for t in (
        Tool("reach_latest", "查询某断面当前各指标最新值（水位/浊度/水流等级），参数 reachId", _reach_latest, ("reachId",)),
        Tool("list_events", "查询事件列表，可选 status（活动/已恢复/无法判定）", _list_events),
        Tool("event_detail", "查询单个事件的状态、关联任务与开放盲区，参数 eventId", _event_detail, ("eventId",)),
        Tool("list_tasks", "查询巡检任务列表，可选 status / eventId", _list_tasks),
        Tool("recovery_assessment", "查询事件的规则化恢复评估，参数 eventId", _recovery, ("eventId",)),
        Tool("anomalies", "查询当前存在异常的断面及关联事件", _anomalies),
    )
}


def run_tool(db: Session, name: str, args: dict | None = None) -> dict:
    tool = REGISTRY.get(name)
    if not tool:
        return {"error": f"未知工具：{name}"}
    missing = [k for k in tool.required if not (args or {}).get(k)]
    if missing:
        return {"error": f"工具 {name} 缺少参数：{', '.join(missing)}"}
    return tool.fn(db, **(args or {}))
