"""演示观测数据回填器（独立、可控、可重置、幂等）。

用途
----
为 PC/小程序图表补齐“最近 7 天”的常规 MQTT 模拟观测历史，并在其中嵌入
S2/S3 式异常发展段与 S5 式缺测段，使近 1h/24h/7d 图表在演示时连续可读。

隔离与安全
----------
- 直接写 observations 表（历史回填），**不经过 MQTT / 规则 / 事件服务**，
  因此不会触发判级、不创建事件、不改变任何恢复评估（实时推送仍由原 MQTT 链路负责）。
- source_type='SIMULATED'、source_name=SOURCE_NAME、scenario_id 标记为
  DEMO7D（常规）/ S2 / S3 / S5（异常或缺测段），明确为演示生成，绝不冒充官方或人工。
- dedup_key 确定性（含锚点/间隔/序号），靠唯一约束 uq_observation_dedup 幂等，
  重复运行只补缺、不叠加重复。
- reset 只删除 source_name=SOURCE_NAME 的回填记录，不触碰官方快照、人工复测、
  MQTT 实时入库或既有事件证据。

示例
----
python scripts/seed_demo_observations.py                 # 回填最近 7 天，10 分钟间隔
python scripts/seed_demo_observations.py --days 3 --interval-min 5
python scripts/seed_demo_observations.py --no-anomaly    # 只回填常规，不嵌异常
python scripts/seed_demo_observations.py --reset         # 删除本脚本生成的回填后退出
"""
from __future__ import annotations

import argparse
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import SessionLocal  # noqa: E402
from app.models.observation import Observation  # noqa: E402

SOURCE_NAME = "demo-backfill"
SCENARIO_BASE = "DEMO7D"
RULE_VERSION = "demo-rules-v1"
REACHES = ("reach-a", "reach-b", "reach-c")
METRICS = ("waterLevel", "turbidity", "flowLevel")


@dataclass(frozen=True)
class MetricCfg:
    baseline: float
    noise: float
    floor: float
    ceiling: float
    decimals: int = 2
    ordinal: bool = False


# 各断面、各指标基线与噪声（教学演示参数，可配置，不声称符合真实水文规律）。
# 三断面基线有适度差异，避免复制同一条序列。
BASE_CFG: dict[str, dict[str, MetricCfg]] = {
    "reach-a": {
        "waterLevel": MetricCfg(4.5, 0.16, 3.9, 5.4),
        "turbidity": MetricCfg(20.0, 2.2, 12.0, 32.0),
        "flowLevel": MetricCfg(1.0, 0.0, 0.0, 3.0, 0, ordinal=True),
    },
    "reach-b": {
        "waterLevel": MetricCfg(4.3, 0.15, 3.7, 5.2),
        "turbidity": MetricCfg(22.0, 2.4, 13.0, 34.0),
        "flowLevel": MetricCfg(1.0, 0.0, 0.0, 3.0, 0, ordinal=True),
    },
    "reach-c": {
        "waterLevel": MetricCfg(4.1, 0.14, 3.5, 5.0),
        "turbidity": MetricCfg(18.0, 2.0, 10.0, 30.0),
        "flowLevel": MetricCfg(1.0, 0.0, 0.0, 3.0, 0, ordinal=True),
    },
}
UNITS = {"waterLevel": "m", "turbidity": "NTU", "flowLevel": "enum0-3"}


@dataclass(frozen=True)
class AnomalyWindow:
    """异常段：相对回填结束时间的偏移（分钟）。在窗口内把水位抬升到高位并演变。"""

    reach: str
    start_ago_min: int
    end_ago_min: int
    peak: float
    scenario: str


@dataclass(frozen=True)
class OutageWindow:
    """缺测段：该断面在窗口内完全不生成观测（断线演示）。"""

    reach: str
    start_ago_min: int
    end_ago_min: int
    scenario: str


def default_windows(days: int) -> tuple[AnomalyWindow | None, tuple[OutageWindow, ...]]:
    """构造一组“近期可见”的异常/缺测窗口（位于最近 36 小时内，确保近 24h 图能看到）。"""
    # S3 式三断面先后上涨：A 最早、B 次之、C 最晚；水位从抬升到峰值再回落。
    anomaly = None  # 异常是“值覆盖”，逐点在生成时计算 ramp，这里用多窗口表达
    outages: tuple[OutageWindow, ...] = ()
    return anomaly, outages


# 异常上涨段（ago 分钟）：每段 [start,end] 内水位按 ramp 抬升，scenario 标识来源。
# 放在最近 ~30 小时内：A 先、B 后、C 最后，形成可观察的发展与回落。
ANOMALY_SEGMENTS: tuple[AnomalyWindow, ...] = (
    AnomalyWindow("reach-a", 60 * 30, 60 * 27, 9.1, "S3"),
    AnomalyWindow("reach-a", 60 * 27, 60 * 25, 8.0, "S3"),
    AnomalyWindow("reach-b", 60 * 29, 60 * 26, 9.05, "S3"),
    AnomalyWindow("reach-b", 60 * 26, 60 * 24, 8.2, "S3"),
    AnomalyWindow("reach-c", 60 * 28, 60 * 25, 9.0, "S3"),
    AnomalyWindow("reach-c", 60 * 25, 60 * 23, 8.1, "S3"),
)
# 缺测段：reach-c 在最近约 6 小时前断过约 3 小时（S5 式），演示断线。
OUTAGE_SEGMENTS: tuple[OutageWindow, ...] = (
    OutageWindow("reach-c", 60 * 14, 60 * 11, "S5"),
)


class Walk:
    """确定性带界随机游走（与 simulator 同思路但独立 seed，保证可重复）。"""

    def __init__(self, cfg: MetricCfg, seed: int) -> None:
        self.cfg = cfg
        self.rng = random.Random(seed)
        self.value = float(int(cfg.baseline)) if cfg.ordinal else round(
            self.rng.uniform(cfg.baseline - cfg.noise, cfg.baseline + cfg.noise), cfg.decimals
        )

    def next(self) -> float:
        if self.cfg.ordinal:
            # 多数为 1，少量 0/2/3，合法枚举，绝不冒充连续流量
            self.value = float(self.rng.choices([0, 1, 2, 3], weights=[6, 78, 13, 3])[0])
            return self.value
        step = self.rng.uniform(-self.cfg.noise, self.cfg.noise) * 0.6
        v = self.value + step
        v += (self.cfg.baseline - v) * 0.12  # 回归基线，避免单调漂移
        v = max(self.cfg.floor, min(self.cfg.ceiling, v))
        self.value = round(v, self.cfg.decimals)
        return self.value


def anomaly_value(reach: str, ago_min: int, base_value: float) -> tuple[float, str] | None:
    """若该时刻位于异常窗口，返回抬升值与 scenario；否则 None。

    窗口内按相对位置做 ramp，体现“上涨 → 峰值 → 回落”的发展过程，
    而不是突兀平顶：前 1/3 由基线抬升到峰值，中 1/3 维持峰值，
    后 1/3 回落到接近基线（仍略高），下一时段恢复常规游走。
    """
    for w in ANOMALY_SEGMENTS:
        if w.reach == reach and w.start_ago_min >= ago_min >= w.end_ago_min:
            span = w.start_ago_min - w.end_ago_min
            pos = (w.start_ago_min - ago_min) / span if span > 0 else 1.0  # 0→1
            if pos < 0.34:
                k = pos / 0.34  # 上涨
            elif pos < 0.67:
                k = 1.0  # 峰值
            else:
                k = max(0.15, 1.0 - (pos - 0.67) / 0.33 * 0.85)  # 回落
            v = base_value + (w.peak - base_value) * k
            return round(v, 2), w.scenario
    return None


def in_outage(reach: str, ago_min: int) -> str | None:
    for o in OUTAGE_SEGMENTS:
        if o.reach == reach and o.start_ago_min >= ago_min >= o.end_ago_min:
            return o.scenario
    return None


def reset_backfill() -> int:
    db = SessionLocal()
    try:
        deleted = (
            db.query(Observation)
            .filter(Observation.source_name == SOURCE_NAME)
            .delete(synchronize_session=False)
        )
        db.commit()
        return int(deleted)
    finally:
        db.close()


def seed(days: int, interval_min: int, seed: int, with_anomaly: bool) -> dict:
    end = datetime.now().replace(second=0, microsecond=0)
    start = end - timedelta(days=days)
    total_span = int((end - start).total_seconds() // 60)

    # 每断面/指标独立确定性 walker（不同 seed -> 三断面有差异；同 seed 重跑一致）
    walks = {
        reach: {m: Walk(BASE_CFG[reach][m], seed + hash_seed(reach, m)) for m in METRICS}
        for reach in REACHES
    }

    db = SessionLocal()
    inserted = 0
    skipped = 0
    try:
        existing = {
            (r, m, k)
            for (r, m, k) in db.query(Observation.reach_id, Observation.metric, Observation.dedup_key)
            .filter(Observation.source_name == SOURCE_NAME)
            .all()
        }
        batch: list[Observation] = []
        step = 0
        t = start
        while t <= end:
            ago_min = int((end - t).total_seconds() // 60)
            for reach in REACHES:
                # 缺测断面在窗口内整组跳过（不生成任何指标，图表断线）
                outage_scenario = in_outage(reach, ago_min) if with_anomaly else None
                if outage_scenario is not None:
                    continue
                for metric in METRICS:
                    cfg = BASE_CFG[reach][metric]
                    value = walks[reach][metric].next()
                    scenario = SCENARIO_BASE
                    # 仅水位在异常窗口抬升；浊度/水流保持常规（异常主要体现为水位）
                    if with_anomaly and metric == "waterLevel":
                        hit = anomaly_value(reach, ago_min, value)
                        if hit is not None:
                            value, scenario = hit[0], hit[1]
                    dedup = f"demo7d-{seed}-{reach}-{metric}-{step:06d}"
                    if (reach, metric, dedup) in existing:
                        skipped += 1
                        continue
                    batch.append(
                        Observation(
                            observation_id=f"obs-demo-{uuid.uuid4().hex[:20]}",
                            reach_id=reach,
                            metric=metric,
                            value=float(value),
                            unit=UNITS[metric],
                            observed_at=t,  # naive CST 墙钟，与既有数据一致
                            ingested_at=datetime.now(),
                            source_type="SIMULATED",
                            source_name=SOURCE_NAME,
                            source_ref=f"seed-demo?days={days}&interval={interval_min}",
                            scenario_id=scenario,
                            quality_flag="GOOD",
                            rule_version=RULE_VERSION,
                            message_id=None,
                            dedup_key=dedup,
                        )
                    )
                    inserted += 1
            step += 1
            t += timedelta(minutes=interval_min)
            if len(batch) >= 1000:
                db.add_all(batch)
                db.commit()
                batch.clear()
        if batch:
            db.add_all(batch)
            db.commit()
    finally:
        db.close()

    return {
        "inserted": inserted,
        "skipped_existing": skipped,
        "span_minutes": total_span,
        "interval_min": interval_min,
        "start": start.isoformat(),
        "end": end.isoformat(),
    }


def hash_seed(reach: str, metric: str) -> int:
    return abs(hash((reach, metric))) % 1_000_000


def stats() -> dict:
    db = SessionLocal()
    try:
        rows = (
            db.query(
                Observation.reach_id,
                Observation.metric,
                Observation.source_name,
            )
            .filter(Observation.source_name == SOURCE_NAME)
            .all()
        )
        from collections import Counter

        c = Counter((r, m) for r, m, _ in rows)
        return {"total": len(rows), "by": dict(c)}
    finally:
        db.close()


def main() -> None:
    p = argparse.ArgumentParser(description="TideWatch 演示观测回填器")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--interval-min", type=int, default=10)
    p.add_argument("--seed", type=int, default=20261028)
    p.add_argument("--no-anomaly", action="store_true", help="只回填常规数据，不嵌入异常/缺测")
    p.add_argument("--reset", action="store_true", help="删除本脚本生成的回填记录后退出")
    p.add_argument("--stats", action="store_true", help="仅打印回填统计后退出")
    args = p.parse_args()

    if args.reset:
        n = reset_backfill()
        print(f"已删除演示回填观测 {n} 条（不影响官方/人工/MQTT 实时数据）。")
        return
    if args.stats:
        print(stats())
        return

    result = seed(args.days, args.interval_min, args.seed, not args.no_anomaly)
    print("回填完成：")
    for k, v in result.items():
        print(f"  {k}: {v}")
    print("当前回填统计：", stats())


if __name__ == "__main__":
    main()
