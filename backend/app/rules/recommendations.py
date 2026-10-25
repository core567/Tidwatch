"""异常处置建议（确定性规则，非 AI）。

输入事件当前状态、范围、关联任务与开放盲区，输出建议动作列表。
只给建议，不直接改变任何状态；前端需用户确认后才派发/操作。
"""
from __future__ import annotations

from typing import Any, Iterable

# 任务非终态（未闭环）
_OPEN_TASK_STATUS = {"PENDING", "ACCEPTED", "IN_PROGRESS", "SUBMITTED"}


def build_recommendations(
    *,
    status: str,
    scope_reach_ids: Iterable[str],
    tasks: Iterable[dict[str, Any]] | None = None,
    open_blindspot_reaches: Iterable[str] | None = None,
    has_manual_evidence: bool = False,
) -> list[dict[str, Any]]:
    scope = list(scope_reach_ids or [])
    tasks = list(tasks or [])
    blind = set(open_blindspot_reaches or [])

    open_tasks = [t for t in tasks if str(t.get("status")) in _OPEN_TASK_STATUS]
    submitted = [t for t in tasks if str(t.get("status")) == "SUBMITTED"]
    active_scope = [r for r in scope if r in blind]

    out: list[dict[str, Any]] = []

    # 1) 待复核回填优先
    if submitted:
        out.append({
            "code": "REVIEW_SUBMISSION",
            "category": "REVIEW",
            "title": "有现场反馈待复核",
            "reason": f"{len(submitted)} 个巡检任务已回填，等待 PC 复核通过或退回补充。",
            "priority": "HIGH",
            "taskId": submitted[0].get("taskId"),
        })

    # 2) 开放盲区阻断恢复判定
    if active_scope:
        out.append({
            "code": "RESOLVE_BLINDSPOT",
            "category": "BLINDSPOT",
            "title": "范围内存在监测盲区",
            "reason": f"断面 {', '.join(active_scope)} 数据链路中断，恢复判定前必须先补数/排除故障。",
            "priority": "HIGH",
            "reachIds": active_scope,
        })

    # 3) 按事件状态给主动作建议
    status_rec = _STATUS_RULES.get(status)
    if status_rec is not None:
        out.append({**status_rec, "scopeReachIds": scope})

    # 4) 未派发现场核查且处于研判/升级态 → 建议派发
    investigable = status in {"OPEN", "INVESTIGATING", "ESCALATED", "NARROWED"}
    if investigable and not open_tasks and scope:
        target = scope[-1]
        out.append({
            "code": "DISPATCH_FIELD_CHECK",
            "category": "TASK",
            "title": "派发现场核查",
            "reason": f"事件处于 {status}，尚无进行中的现场任务，建议对 {target} 派发人工核查。",
            "priority": "NORMAL" if status != "ESCALATED" else "HIGH",
            "suggestedTask": {
                "actionType": "MANUAL_CHECK",
                "reachId": target,
            },
        })

    # 5) 升级态缺人工证据 → 建议补充证据
    if status == "ESCALATED" and not has_manual_evidence:
        out.append({
            "code": "ADD_MANUAL_EVIDENCE",
            "category": "EVIDENCE",
            "title": "补充人工证据",
            "reason": "事件已升级但缺少现场/人工证据，建议登记佐证或反例后再决定是否收窄/恢复。",
            "priority": "NORMAL",
        })

    return out


_STATUS_RULES: dict[str, dict[str, Any]] = {
    "OPEN": {
        "code": "START_INVESTIGATION",
        "category": "EVENT_ACTION",
        "title": "开始研判",
        "reason": "事件为待初查，建议确认异常成立后进入研判。",
        "eventAction": "START_INVESTIGATION",
        "priority": "NORMAL",
    },
    "INVESTIGATING": {
        "code": "DECIDE_SCOPE",
        "category": "EVENT_ACTION",
        "title": "收窄范围或持续观察",
        "reason": "研判中：证据支持范围明确可收窄，证据不足则保持持续观察。",
        "priority": "NORMAL",
    },
    "ESCALATED": {
        "code": "ESCALATED_HANDLE",
        "category": "EVENT_ACTION",
        "title": "处置升级事件",
        "reason": "事件已升级，优先核查下游传播并派发/复核现场任务。",
        "priority": "HIGH",
    },
    "MONITORING": {
        "code": "CONTINUE_MONITOR",
        "category": "EVENT_ACTION",
        "title": "持续观察",
        "reason": "处于持续观察，等待更多观测确认是否恢复或继续传播。",
        "priority": "LOW",
    },
    "NARROWED": {
        "code": "NARROWED_MONITOR",
        "category": "EVENT_ACTION",
        "title": "在收窄范围内观察",
        "reason": "范围已收窄，关注范围内断面是否满足恢复条件。",
        "priority": "LOW",
    },
    "RECOVERY_PENDING": {
        "code": "CONFIRM_RECOVERY",
        "category": "EVENT_ACTION",
        "title": "确认恢复",
        "reason": "已满足恢复前置，建议在恢复窗口观测达标后确认恢复（恢复评估以观测为准）。",
        "eventAction": "CONFIRM_RECOVERED",
        "priority": "HIGH",
    },
    "RECOVERED": {
        "code": "REVIEW_RECOVERED",
        "category": "CLOSE",
        "title": "事件复盘",
        "reason": "事件已恢复，可进入复盘并归档时间线与处置前后对比。",
        "priority": "LOW",
    },
    "UNRESOLVED": {
        "code": "REOPEN_IF_EVIDENCE",
        "category": "EVENT_ACTION",
        "title": "证据充分时重新打开",
        "reason": "当前无法判定，若补充到关键观测或现场证据可重新打开事件。",
        "eventAction": "REOPEN",
        "priority": "LOW",
    },
}
