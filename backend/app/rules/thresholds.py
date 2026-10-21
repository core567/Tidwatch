"""教学演示阈值（demo-rules-v1）。

来源：C02 统一判级规则，仅用于编程练习与竞赛演示，
不是真实水文防汛标准或官方预警阈值，页面与报告必须标注 demo 性质。
判断顺序体现水位维度优先：
  ① waterLevel >= 8.5 洪水预警
  ② 否则 waterLevel >= 7.0 高水位警戒
  ③ 否则 turbidity  >= 60  水质浑浊（waterLevel < 7.0）
  ④ 其余 正常
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum


class EnvStatus(str, Enum):
    NORMAL = "NORMAL"
    WATER_LEVEL_WATCH = "WATER_LEVEL_WATCH"
    FLOOD_WARNING = "FLOOD_WARNING"
    TURBIDITY_HIGH = "TURBIDITY_HIGH"


ENV_STATUS_LABEL: dict[EnvStatus, str] = {
    EnvStatus.NORMAL: "正常",
    EnvStatus.WATER_LEVEL_WATCH: "高水位警戒",
    EnvStatus.FLOOD_WARNING: "洪水预警",
    EnvStatus.TURBIDITY_HIGH: "水质浑浊",
}


@dataclass(frozen=True)
class RuleParams:
    water_level_flood: float = 8.5
    water_level_watch: float = 7.0
    turbidity_muddy: float = 60.0

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


# M0 唯一启用版本
DEMO_RULES_V1 = RuleParams()


def classify_environment(
    water_level: float,
    turbidity: float,
    params: RuleParams = DEMO_RULES_V1,
) -> EnvStatus:
    """按固定顺序判级。入参应为通过量纲校验后的数值。"""
    if water_level >= params.water_level_flood:
        return EnvStatus.FLOOD_WARNING
    if water_level >= params.water_level_watch:
        return EnvStatus.WATER_LEVEL_WATCH
    if turbidity >= params.turbidity_muddy:
        return EnvStatus.TURBIDITY_HIGH
    return EnvStatus.NORMAL


def is_abnormal(status: EnvStatus) -> bool:
    return status is not EnvStatus.NORMAL
