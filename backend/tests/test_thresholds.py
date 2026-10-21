"""教学阈值规则测试：C02 统一回归四组数据 + 边界 + 判断顺序。"""
from __future__ import annotations

import pytest

from app.rules import (
    DEMO_RULES_V1,
    ENV_STATUS_LABEL,
    EnvStatus,
    RuleParams,
    classify_environment,
    is_abnormal,
)


@pytest.mark.parametrize(
    "water_level,turbidity,expected",
    [
        # C02 统一回归测试数据，期望值按语义映射
        (4.5, 20, EnvStatus.NORMAL),
        (7.6, 20, EnvStatus.WATER_LEVEL_WATCH),
        (9.0, 20, EnvStatus.FLOOD_WARNING),
        (4.5, 75, EnvStatus.TURBIDITY_HIGH),
    ],
)
def test_c02_regression_cases(water_level: float, turbidity: float, expected: EnvStatus):
    assert classify_environment(water_level, turbidity) is expected


def test_boundary_values():
    assert classify_environment(7.0, 0) is EnvStatus.WATER_LEVEL_WATCH
    assert classify_environment(8.5, 0) is EnvStatus.FLOOD_WARNING
    assert classify_environment(6.99, 60) is EnvStatus.TURBIDITY_HIGH
    assert classify_environment(6.99, 59.99) is EnvStatus.NORMAL


def test_water_level_has_priority_over_turbidity():
    # 同时满足水位与浊度异常时，必须按顺序判为水位/洪水，不得判为水质浑浊
    assert classify_environment(9.0, 100) is EnvStatus.FLOOD_WARNING
    assert classify_environment(7.5, 100) is EnvStatus.WATER_LEVEL_WATCH


def test_custom_params_and_labels():
    # 现场可改阈值（Modify 验证）：换参数结果应跟随变化
    strict = RuleParams(water_level_flood=8.0, water_level_watch=6.5, turbidity_muddy=50)
    assert classify_environment(6.6, 10, strict) is EnvStatus.WATER_LEVEL_WATCH
    assert classify_environment(6.6, 10, DEMO_RULES_V1) is EnvStatus.NORMAL
    assert ENV_STATUS_LABEL[EnvStatus.FLOOD_WARNING] == "洪水预警"
    assert is_abnormal(EnvStatus.NORMAL) is False
    assert is_abnormal(EnvStatus.TURBIDITY_HIGH) is True
