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

## F8 异常模拟与闭环联调（追加）

F8 场景复用同一发布器与 MQTT 链路，数据均标记 `sourceType=SIMULATED`、`scenarioId=F8Sx`。
阈值来自 `backend/app/rules/thresholds.py`：水位 8.5/7.0 m、浊度 60 NTU；
连续 2 点确认、连续 3 点恢复、跨断面关联窗口 20 分钟。

| 编号 | 注入 | 预期 |
|---|---|---|
| F8S1 | A 水位 9.0 tick 8–18 | 单事件，范围 A，INVESTIGATING；不自动建任务 |
| F8S2 | B 浊度 65–75 tick 8–18 | 单事件 `TURBIDITY_SUDDEN_CHANGE`，范围 B；不自动建任务 |
| F8S3 | A 9.0 tick 8–24 / B 8.9 tick 12–24 / C 8.8 tick 16–24 | 同一事件扩展到 A/B/C；B 纳入时为 C 自动建任务 |
| F8S4 | 三断面连续正常 12 tick | 需先运行 F8S1/F8S3；3 个正常点后事件自动恢复 |

```bash
# F8-S1 / F8-S2 单断面
../backend/.venv/Scripts/python.exe run_scenario.py --scenario F8S1 --speed 1
../backend/.venv/Scripts/python.exe run_scenario.py --scenario F8S2 --speed 1

# F8-S3 生成 A/B/C 事件与 C 任务
../backend/.venv/Scripts/python.exe run_scenario.py --scenario F8S3 --speed 1

# 完成现场巡检/PC 复核后，用 F8S4 注入正常序列触发恢复
../backend/.venv/Scripts/python.exe run_scenario.py --scenario F8S4 --speed 1
```

**注意**：F8S4 是“恢复续跑”场景，不自己制造异常；必须先有 F8S1/F8S3 产生的活动事件。
续跑时必须让虚拟时钟晚于上一场景最后一条观测，否则恢复窗口会与异常时段重叠：

```bash
# 示例：先取最后一次观测时间，再加 1 分钟后作为 F8S4 起点
../backend/.venv/Scripts/python.exe run_scenario.py --scenario F8S4 --speed 1 \
  --start-at "2026-11-03T21:40:00+08:00"
```

完整闭环推荐顺序（异常在过去、复核在当前、恢复在复核之后）：

1. `F8S1` 用 `--start-at` 设为当前时间前 30 分钟，制造近期异常；
2. PC 从事件研判页派发任务，小程序接单、采集、拍照、提交；
3. PC 复核通过（退回→重提→通过也可）；
4. `F8S4` 用 `--start-at` 设为复核之后 1 分钟，注入正常序列；
5. 事件进入 RECOVERED，恢复评估应显示“证据支持恢复”。

场景结束时发布器会广播 OFFLINE；若事件活动，相关断面会形成监测盲区，下一次场景启动发布 ONLINE 后自动解除。

协议细节与 MQTTX 手动操作见 [../docs/mqtt-protocol.md](../docs/mqtt-protocol.md)。
