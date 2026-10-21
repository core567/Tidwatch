"""活动事件 8 态状态机（GRP 5.1）。

状态迁移只能经此模块执行：前端/接口提交“动作”，
由后端查表决定目标状态；非法迁移抛 IllegalTransition。
规则自动迁移与人工操作共用同一张表，trigger 仅用于留痕区别。
"""
from __future__ import annotations

from app.core.enums import EventStatus


class IllegalTransition(Exception):
    def __init__(self, current: str, action: str) -> None:
        super().__init__(f"非法状态迁移: {current} 不允许执行 {action}")
        self.current = current
        self.action = action


# 人工/规则动作 -> 可执行该动作的源状态 -> 目标状态
class EventAction:
    START_INVESTIGATION = "START_INVESTIGATION"
    ESCALATE = "ESCALATE"
    KEEP_MONITORING = "KEEP_MONITORING"
    NARROW_SCOPE = "NARROW_SCOPE"
    MARK_RECOVERY_PENDING = "MARK_RECOVERY_PENDING"
    CONFIRM_RECOVERED = "CONFIRM_RECOVERED"
    MARK_UNRESOLVED = "MARK_UNRESOLVED"
    REOPEN = "REOPEN"


_TRANSITIONS: dict[str, dict[EventStatus, EventStatus]] = {
    EventAction.START_INVESTIGATION: {
        EventStatus.OPEN: EventStatus.INVESTIGATING,
        EventStatus.MONITORING: EventStatus.INVESTIGATING,
        EventStatus.NARROWED: EventStatus.INVESTIGATING,
        EventStatus.RECOVERY_PENDING: EventStatus.INVESTIGATING,
        EventStatus.UNRESOLVED: EventStatus.INVESTIGATING,
    },
    EventAction.ESCALATE: {
        EventStatus.OPEN: EventStatus.ESCALATED,
        EventStatus.INVESTIGATING: EventStatus.ESCALATED,
        EventStatus.MONITORING: EventStatus.ESCALATED,
        EventStatus.NARROWED: EventStatus.ESCALATED,
        EventStatus.RECOVERY_PENDING: EventStatus.ESCALATED,
    },
    EventAction.KEEP_MONITORING: {
        EventStatus.OPEN: EventStatus.MONITORING,
        EventStatus.INVESTIGATING: EventStatus.MONITORING,
        EventStatus.ESCALATED: EventStatus.MONITORING,
        EventStatus.NARROWED: EventStatus.MONITORING,
        EventStatus.RECOVERY_PENDING: EventStatus.MONITORING,
    },
    EventAction.NARROW_SCOPE: {
        EventStatus.INVESTIGATING: EventStatus.NARROWED,
        EventStatus.MONITORING: EventStatus.NARROWED,
    },
    # 恢复必须先进入 RECOVERY_PENDING（满足恢复窗口后由规则或人工触发），
    # 禁止从 OPEN/INVESTIGATING 直接 RECOVERED（对齐 C02 D3 非法迁移示例）。
    EventAction.MARK_RECOVERY_PENDING: {
        EventStatus.INVESTIGATING: EventStatus.RECOVERY_PENDING,
        EventStatus.MONITORING: EventStatus.RECOVERY_PENDING,
        EventStatus.ESCALATED: EventStatus.RECOVERY_PENDING,
    },
    EventAction.CONFIRM_RECOVERED: {
        EventStatus.RECOVERY_PENDING: EventStatus.RECOVERED,
    },
    EventAction.MARK_UNRESOLVED: {
        EventStatus.INVESTIGATING: EventStatus.UNRESOLVED,
        EventStatus.MONITORING: EventStatus.UNRESOLVED,
        EventStatus.RECOVERY_PENDING: EventStatus.UNRESOLVED,
    },
    # 恢复后再发：已恢复事件可因新证据重新打开
    EventAction.REOPEN: {
        EventStatus.RECOVERED: EventStatus.INVESTIGATING,
        EventStatus.UNRESOLVED: EventStatus.INVESTIGATING,
    },
}

ALL_ACTIONS: frozenset[str] = frozenset(_TRANSITIONS.keys())


def allowed_actions(current: EventStatus | str) -> list[str]:
    current = EventStatus(current)
    return [a for a, table in _TRANSITIONS.items() if current in table]


def next_status(current: EventStatus | str, action: str) -> EventStatus:
    """返回目标状态；动作未知或当前状态不允许时抛 IllegalTransition。"""
    current = EventStatus(current)
    table = _TRANSITIONS.get(action)
    if table is None or current not in table:
        raise IllegalTransition(current.value, action)
    return table[current]


def can_transition(current: EventStatus | str, action: str) -> bool:
    try:
        next_status(current, action)
        return True
    except IllegalTransition:
        return False
