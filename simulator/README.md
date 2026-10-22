# TideWatch 场景发布器

经 MQTT 向 Mosquitto 发布 S1–S5 场景数据（不直连后端）。固定 seed，可重放。

## 运行（复用后端 venv，无需另装依赖）

```bash
cd simulator
# 持续运行（Ctrl+C 停止并广播 OFFLINE）
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S1 --speed 1

# 固定周期（自动化验证）：10 个周期、5 倍速
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S1 --ticks 10 --speed 5
```

参数：`--host`（默认 127.0.0.1）、`--port`（1883）、`--speed`（倍速）、`--ticks`（周期数）。

需先启动：Mosquitto → 后端（`MQTT_ENABLED=true`）。

## S1 稳定基线（M1）

- 三断面水位/浊度/水流等级在正常区间做带界随机游走（seed=20261021）；
- 同 seed 重置后数据序列完全一致；
- 全部值经 `demo-rules-v1` 判级为「正常」，不产生异常事件；
- 使用真实墙钟时间，适合长时间数据流演示。

## S2 先后变化 A→B（M2）

- 虚拟时钟：16 tick，每 tick 推进 60 虚拟秒，但发布间隔 0.6s（`--speed` 再压缩）；
- A 在虚拟第 4 分钟起持续高水位（≥9.0m），B 在第 13 分钟起连续高水位；
- 期望结果：**1 个事件 TW-xxx**，范围由 A 扩展到 A/B（版本 2），
  A→B 时序关系 540 秒（标注非因果），自动建立对 C 的观察重点。

```bash
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S2 --speed 4
```

## S3 范围扩展 A→B→C（M2，Golden Demo）

- 25 tick；在 S2 基础上 C 于第 22 分钟起同向高水位；
- 期望结果：**同一事件扩展到 A/B/C（版本 3）**，3 个变化、2 条时序关系。

```bash
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S3 --speed 6
```

异常断面在脚本结束时广播 OFFLINE；S2/S3 结束后事件保持活动状态（需在 P03 人工处置或后续恢复数据）。

协议细节与 MQTTX 手动操作见 [../docs/mqtt-protocol.md](../docs/mqtt-protocol.md)。
