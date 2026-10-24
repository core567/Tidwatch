"""场景发布器：固定 seed 数据经 Mosquitto 发布到三断面 topic。"""
from __future__ import annotations

import json
import signal
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Callable

import paho.mqtt.client as mqtt

from tidewatch_sim.generator import (
    SCENARIOS,
    ScenarioSpec,
    anomaly_value,
    build_walkers,
)
from tidewatch_sim.generator import S5_OUTAGES

CST = timezone(timedelta(hours=8))


class ScenarioPublisher:
    def __init__(
        self,
        spec: ScenarioSpec,
        host: str = "127.0.0.1",
        port: int = 1883,
        speed: float = 1.0,
        client_id: str | None = None,
        start_time: datetime | None = None,
    ) -> None:
        self.spec = spec
        self.host = host
        self.port = port
        self.speed = max(speed, 0.1)
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id or f"tw-sim-{spec.scenario_id}-{uuid.uuid4().hex[:6]}",
        )
        self.walkers = build_walkers(spec)
        self.seq = 0
        self._stop = False
        self._offline_announced: set[str] = set()
        self.on_publish: Callable[[str, dict], None] | None = None
        # 虚拟场景时钟：tick_step_seconds 为 None 时退回墙钟时间（S1）
        self._virtual_base = start_time or datetime.now(CST)
        self._virtual_time = self._virtual_base

    def _topics(self, reach_id: str) -> dict[str, str]:
        return {
            "observation": f"tidewatch/v1/{reach_id}/observation",
            "status": f"tidewatch/v1/{reach_id}/status",
        }

    def start(self) -> None:
        # 遗嘱：异常断开时 broker 代发 OFFLINE
        for reach in self.spec.reaches:
            self.client.will_set(
                self._topics(reach.reach_id)["status"],
                json.dumps({"status": "OFFLINE"}),
                qos=1,
            )
        self.client.connect(self.host, self.port, keepalive=30)
        self.client.loop_start()
        for reach in self.spec.reaches:
            self.client.publish(
                self._topics(reach.reach_id)["status"],
                json.dumps({"status": "ONLINE"}),
                qos=1,
            )

    def stop(self, *, announce_offline: bool = True) -> None:
        if self._stop:
            return
        self._stop = True
        if announce_offline:
            for reach in self.spec.reaches:
                self.client.publish(
                    self._topics(reach.reach_id)["status"],
                    json.dumps({"status": "OFFLINE"}),
                    qos=1,
                )
            time.sleep(0.3)
        self.client.loop_stop()
        self.client.disconnect()

    def tick(self) -> list[tuple[str, dict]]:
        """推进一个采样周期，向每个断面发布一条多指标快照。"""
        self.seq += 1
        tick = self.seq

        # 推进虚拟时钟（S2/S3）或用墙钟（S1）
        if self.spec.tick_step_seconds is not None:
            if tick == 1:
                self._virtual_time = self._virtual_base
            else:
                self._virtual_time = self._virtual_base + timedelta(
                    seconds=self.spec.tick_step_seconds * (tick - 1)
                )
            observed_at = self._virtual_time.isoformat()
        else:
            observed_at = datetime.now(CST).isoformat()

        published: list[tuple[str, dict]] = []
        outages = S5_OUTAGES if self.spec.scenario_id == "S5" else ()
        offline_announced: set[str] = set()
        for reach in self.spec.reaches:
            # S5：中断区间内的断面不发观测，仅在中断首个 tick 广播一次 OFFLINE
            outage = next(
                (o for o in outages if o.reach_id == reach.reach_id
                 and tick >= o.start_tick and (o.end_tick is None or tick <= o.end_tick)),
                None,
            )
            if outage is not None:
                if reach.reach_id not in self._offline_announced:
                    self.client.publish(
                        self._topics(reach.reach_id)["status"],
                        json.dumps({"status": "OFFLINE"}),
                        qos=1,
                    )
                    self._offline_announced.add(reach.reach_id)
                continue
            metrics = {}
            for key, walker in self.walkers[reach.reach_id].items():
                spec_metric = next(m for m in reach.metrics if m.key == key)
                # 脚本化异常优先，否则随机游走
                forced = anomaly_value(self.spec, reach.reach_id, tick, key)
                value = forced if forced is not None else walker.next()
                metrics[key] = {"value": value, "unit": spec_metric.unit, "qualityFlag": "GOOD"}
                if key == "flowLevel":
                    metrics[key]["perceptionSource"] = "SIMULATED"
            message_id = f"{self.spec.scenario_id}-{reach.reach_id}-{self.seq:05d}"
            payload = {
                "messageId": message_id,
                "reachId": reach.reach_id,
                "observedAt": observed_at,
                "scenarioId": self.spec.scenario_id,
                "sourceType": "SIMULATED",
                "seq": self.seq,
                "metrics": metrics,
            }
            self.client.publish(
                self._topics(reach.reach_id)["observation"],
                json.dumps(payload, ensure_ascii=False),
                qos=1,
            )
            published.append((reach.reach_id, payload))
            if self.on_publish is not None:
                self.on_publish(reach.reach_id, payload)
        return published

    def run(self, ticks: int | None = None) -> None:
        """持续发布；ticks 给定时跑固定周期，否则用场景 total_ticks，再否则到 Ctrl+C。"""
        if ticks is None:
            ticks = self.spec.total_ticks
        interval = max(0.05, self.spec.interval_sec / self.speed)
        self.start()

        def _handle_sig(*_args):
            self._stop = True

        signal.signal(signal.SIGINT, _handle_sig)
        try:
            while not self._stop and (ticks is None or self.seq < ticks):
                self.tick()
                time.sleep(interval)
        finally:
            self.stop()
