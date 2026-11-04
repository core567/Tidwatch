"""命令行入口：python run_scenario.py --scenario S1 --ticks 30 --speed 2"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tidewatch_sim.generator import SCENARIOS  # noqa: E402
from tidewatch_sim.publisher import ScenarioPublisher  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="TideWatch S1–S5 / F8S1–F8S4 场景发布器")
    parser.add_argument("--scenario", default="S1", choices=sorted(SCENARIOS.keys()))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--speed", type=float, default=1.0, help="倍速（间隔=基准间隔/倍速）")
    parser.add_argument("--ticks", type=int, default=None, help="采样周期数；不给则持续到 Ctrl+C")
    parser.add_argument(
        "--start-at",
        default=None,
        help="虚拟时钟起点（ISO8601）。续跑场景使用，应晚于上一场景最后一条观测时间",
    )
    args = parser.parse_args()

    spec = SCENARIOS[args.scenario]
    start_time = None
    if args.start_at:
        start_time = datetime.fromisoformat(args.start_at)
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone(timedelta(hours=8)))
    publisher = ScenarioPublisher(spec, args.host, args.port, args.speed, start_time=start_time)

    def _log(reach_id: str, payload: dict) -> None:
        vals = ", ".join(f"{k}={v['value']}{v['unit']}" for k, v in payload["metrics"].items())
        print(f"[{payload['observedAt'][11:19]}] {reach_id} {vals}")

    publisher.on_publish = _log
    print(f"场景 {spec.scenario_id}（{spec.name}）seed={spec.seed} 启动；Ctrl+C 停止")
    print(spec.description)
    publisher.run(ticks=args.ticks)
    print("场景已停止，三断面已广播 OFFLINE")


if __name__ == "__main__":
    main()
