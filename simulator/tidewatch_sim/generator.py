"""固定 seed 的确定性场景生成器，保证可重置、可重放。

S1：三断面在稳定区间小幅随机游走，全部判级正常。
S2：A 先出现连续高水位 → 约 9 分钟后 B 同向变化（归入同一事件，下一观察重点 C）。
S3：在 S2 基础上 C 也同向变化（范围扩展到 A/B/C，Golden Demo）。

异常断面使用“虚拟时钟”：发布间隔由 speed 控制（演示可加速），
但 observedAt 按场景虚拟分钟推进，使跨断面时序关系在快速演示中依然成立。
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field


@dataclass(frozen=True)
class MetricSpec:
    key: str
    unit: str
    baseline: float
    noise: float
    floor: float
    ceiling: float
    decimals: int = 2
    kind: str = "continuous"

    def initial(self, rng: random.Random) -> float:
        return round(rng.uniform(self.baseline - self.noise, self.baseline + self.noise), self.decimals)


@dataclass(frozen=True)
class ReachPlan:
    reach_id: str
    metrics: tuple[MetricSpec, ...]


@dataclass(frozen=True)
class Anomaly:
    """某断面在 [start_tick, end_tick]（含）把 metric 覆盖为固定异常值序列。"""

    reach_id: str
    start_tick: int
    end_tick: int
    metric: str
    values: tuple[float, ...]


@dataclass(frozen=True)
class ScenarioSpec:
    scenario_id: str
    name: str
    description: str
    seed: int
    interval_sec: float
    reaches: tuple[ReachPlan, ...]
    anomalies: tuple[Anomaly, ...] = ()
    total_ticks: int | None = None
    # 每 tick 推进的虚拟秒数；None 表示用真实墙钟时间（S1 实时数据流）
    tick_step_seconds: int | None = None


def _cont(key: str, unit: str, baseline: float, noise: float,
          floor: float, ceiling: float, decimals: int = 2) -> MetricSpec:
    return MetricSpec(key, unit, baseline, noise, floor, ceiling, decimals, "continuous")


FLOW_LEVEL = MetricSpec("flowLevel", "enum0-3", 1.0, 0.0, 0.0, 1.0, 0, "ordinal")


def _reaches() -> tuple[ReachPlan, ...]:
    return (
        ReachPlan("reach-a", (
            _cont("waterLevel", "m", 4.5, 0.35, 3.8, 5.5),
            _cont("turbidity", "NTU", 20.0, 5.0, 10.0, 34.0),
            FLOW_LEVEL,
        )),
        ReachPlan("reach-b", (
            _cont("waterLevel", "m", 4.3, 0.30, 3.6, 5.3),
            _cont("turbidity", "NTU", 22.0, 5.0, 12.0, 36.0),
            FLOW_LEVEL,
        )),
        ReachPlan("reach-c", (
            _cont("waterLevel", "m", 4.1, 0.30, 3.4, 5.1),
            _cont("turbidity", "NTU", 18.0, 4.0, 9.0, 30.0),
            FLOW_LEVEL,
        )),
    )


S1 = ScenarioSpec(
    scenario_id="S1",
    name="稳定基线",
    description="A/B/C 三断面在正常区间小幅波动，数据完整，不应产生任何异常事件。",
    seed=20261021,
    interval_sec=1.0,
    reaches=_reaches(),
    total_ticks=30,
)

# 异常节奏（tick=虚拟分钟）：
#   A 在 4,5 起持续高水位并维持到 B 出现（不提前恢复，保证归入同一事件）；
#   B 在 13,14 连续高水位（与 A 首发相差 9 分钟，<20 分钟关联窗口，检测需连续 2 点确认）。
#   场景 16 tick 结束，此时 A 仍异常、B 刚确认，事件保持活动，下一观察重点为 C。
S2 = ScenarioSpec(
    scenario_id="S2",
    name="先后变化（A→B）",
    description="上游 A 先出现连续高水位，约 9 分钟后中游 B 同向变化；建立一个跨 A/B 的事件，下一观察重点为 C。",
    seed=20261022,
    interval_sec=0.6,
    reaches=_reaches(),
    anomalies=(
        Anomaly("reach-a", 4, 14, "waterLevel", (9.0, 9.1)),
        Anomaly("reach-b", 13, 14, "waterLevel", (8.9, 9.05)),
    ),
    total_ticks=16,
    tick_step_seconds=60,
)

# S3：A 持续异常至 23；B 在 13,14；C 在 22,23 同向变化，范围扩到 A/B/C；25 tick 结束。
S3 = ScenarioSpec(
    scenario_id="S3",
    name="范围扩展（A→B→C）",
    description="在 S2 基础上下游 C 也出现同向高水位，同一事件范围扩展至 A/B/C（Golden Demo）。",
    seed=20261023,
    interval_sec=0.6,
    reaches=_reaches(),
    anomalies=(
        Anomaly("reach-a", 4, 23, "waterLevel", (9.0, 9.1)),
        Anomaly("reach-b", 13, 23, "waterLevel", (8.9, 9.05)),
        Anomaly("reach-c", 22, 23, "waterLevel", (8.8, 9.0)),
    ),
    total_ticks=25,
    tick_step_seconds=60,
)

SCENARIOS: dict[str, ScenarioSpec] = {"S1": S1, "S2": S2, "S3": S3}


class StableWalk:
    """单指标带界随机游走；同 seed 重置后产生完全相同序列。"""

    def __init__(self, spec: MetricSpec, rng: random.Random) -> None:
        self.spec = spec
        self.rng = rng
        self.value = float(int(spec.baseline)) if spec.kind == "ordinal" else spec.initial(rng)

    def next(self) -> float:
        if self.spec.kind == "ordinal":
            self.value = 0.0 if self.rng.random() < 0.10 else 1.0
            return self.value
        step = self.rng.uniform(-self.spec.noise, self.spec.noise) * 0.5
        value = self.value + step
        value += (self.spec.baseline - value) * 0.10
        value = max(self.spec.floor, min(self.spec.ceiling, value))
        self.value = round(value, self.spec.decimals)
        return self.value


def build_walkers(spec: ScenarioSpec) -> dict[str, dict[str, StableWalk]]:
    root = random.Random(spec.seed)
    walkers: dict[str, dict[str, StableWalk]] = {}
    for reach in spec.reaches:
        walkers[reach.reach_id] = {
            m.key: StableWalk(m, random.Random(root.getrandbits(64))) for m in reach.metrics
        }
    return walkers


def anomaly_value(spec: ScenarioSpec, reach_id: str, tick: int, metric: str) -> float | None:
    """返回该 tick 某断面某指标的脚本化异常值；无异常返回 None。"""
    for a in spec.anomalies:
        if a.reach_id != reach_id or a.metric != metric:
            continue
        if a.start_tick <= tick <= a.end_tick:
            idx = tick - a.start_tick
            return a.values[min(idx, len(a.values) - 1)]
    return None
