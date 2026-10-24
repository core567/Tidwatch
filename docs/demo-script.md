# 演示脚本（5 分钟）

> 前置：Mosquitto 在 127.0.0.1:1883 运行；三端依赖已安装；数据库已初始化。

## 0. 启动

```bash
# 后端（启用 MQTT 入库 + 实时推送）
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000 --reload

# 前端（另开终端）
cd frontend && npm run dev
```

浏览器打开 http://localhost:5173，用 `admin / Admin#2026` 登录。

## 1. S1 稳定基线（约 3 秒）

- P12 系统管理 → 场景控制台 → 点击「S1 稳定基线」
- 观察：P01 三断面持续 ONLINE、数据流动，**P03 无活动事件**

## 2. S2 先后变化（约 4 秒）

- P12 → 「S2 A→B 变化」
- P03：出现 TW-001，范围 上游A→中游B
- P04：时序关系「相差 9 分钟，不构成因果」、证据链、假设
- P07：节点 A/B 红色脉冲；点击「中游 B」相机飞行 + 详情面板 → 返回全景

## 3. S3 范围扩展（约 5 秒，Golden Demo）

- P12 → 「S3 A→B→C」
- P03：范围扩到三断面、版本 v3；P07 三个节点异常
- P05：自动出现「现场核查 C」巡检任务

## 4. 巡检回填（小程序）

- 微信开发者工具打开 `miniprogram/`，用 `inspector / Inspector#2026` 登录
- 任务列表 → 接收 → 开始 → 拍照 + 记录 → 结论「未见异常」→ 提交
- PC 端 P04/P06 出现 MANUAL 反证证据，触发再评估

## 5. S4 反例 / S5 盲区

- S4：C 窗口内稳定 → P06 传播假设变「不支持」，范围不扩到 C
- S5：C 中断 → P02/P07 显示盲区，事件在盲区期间不被错误恢复

## 6. 研判单

- P04 → 「研判单」→ P08：证据/版本/未解决项 → 打印/导出 PDF

## 命令行等价方式

```bash
cd simulator
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S3 --speed 8
# 真实 broker 自动回归：
cd ../backend && .venv/Scripts/python.exe scripts/e2e_scenarios.py
```

## 故障注入演示（MQTTX）

按 `docs/mqtt-protocol.md` 的「MQTTX 操作卡」发送坏 JSON / 超量程 / 重复消息，
P12「最近坏消息」实时显示 INVALID_JSON / OUT_OF_RANGE 等死信。
