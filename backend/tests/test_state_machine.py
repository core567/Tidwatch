"""8 态事件状态机迁移测试（对齐 C02 D3：显式转移、拒绝非法迁移）。"""
from __future__ import annotations

import pytest

from app.core.enums import EventStatus
from app.rules import (
    ALL_ACTIONS,
    EventAction,
    IllegalTransition,
    allowed_actions,
    can_transition,
    next_status,
)


def test_full_lifecycle_path():
    s = EventStatus.OPEN
    s = next_status(s, EventAction.START_INVESTIGATION)
    assert s is EventStatus.INVESTIGATING
    s = next_status(s, EventAction.MARK_RECOVERY_PENDING)
    assert s is EventStatus.RECOVERY_PENDING
    s = next_status(s, EventAction.CONFIRM_RECOVERED)
    assert s is EventStatus.RECOVERED
    # 恢复后再发：新证据可重新打开事件
    s = next_status(s, EventAction.REOPEN)
    assert s is EventStatus.INVESTIGATING


def test_open_cannot_jump_directly_to_recovered():
    # C02 非法迁移示例：OPEN 直跳 RECOVERED 必须被拒绝
    assert not can_transition(EventStatus.OPEN, EventAction.CONFIRM_RECOVERED)
    with pytest.raises(IllegalTransition):
        next_status(EventStatus.OPEN, EventAction.CONFIRM_RECOVERED)


def test_escalation_and_narrowing():
    assert next_status(EventStatus.OPEN, EventAction.ESCALATE) is EventStatus.ESCALATED
    assert next_status(EventStatus.INVESTIGATING, EventAction.NARROW_SCOPE) is EventStatus.NARROWED
    # 范围收窄不能从 OPEN 直接发生（需要先调查）
    assert not can_transition(EventStatus.OPEN, EventAction.NARROW_SCOPE)


def test_unresolved_paths():
    assert next_status(EventStatus.MONITORING, EventAction.MARK_UNRESOLVED) is EventStatus.UNRESOLVED
    # 证据不足无法判定，后续证据回来可重新调查
    assert next_status(EventStatus.UNRESOLVED, EventAction.START_INVESTIGATION) is EventStatus.INVESTIGATING
    # 已恢复的事件不应被标为无法判定
    assert not can_transition(EventStatus.RECOVERED, EventAction.MARK_UNRESOLVED)


def test_unknown_action_rejected():
    with pytest.raises(IllegalTransition):
        next_status(EventStatus.OPEN, "NOT_A_REAL_ACTION")


def test_allowed_actions_and_table_completeness():
    assert EventAction.ESCALATE in allowed_actions(EventStatus.OPEN)
    # 8 个动作全部登记
    assert len(ALL_ACTIONS) == 8
    # RECOVERED 仅允许 REOPEN；终态语义清晰
    assert allowed_actions(EventStatus.RECOVERED) == [EventAction.REOPEN]
