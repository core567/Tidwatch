# TideWatch V1.0

**汉江武汉段多断面异常演化研判与巡检辅助系统**（竞赛作品）。
核心不是数据大屏，而是把 **观测 → 变化识别 → 活动事件 → 时序关系 → 证据/假设 →
观察重点 → 巡检 → 后续证据再评估 → 事件复盘** 串成可追溯、可复核、可复盘的工作流。

> 数据原则：**官方公开历史资料（月度水质类别）+ 官方自动站当前快照（低频手动拉取）+
> 明确标识的 MQTT 模拟连续数据 + 可追溯事件证据**。
> 模拟数据在全站、接口与导出物中显式标记；官方实时快照只展示当前值，不插值为连续趋势；
> 真实站点坐标/上下游未核实前使用逻辑节点 A/B/C 并标注「示意拓扑」。

## 总体架构

```
官方月报(HTML/CSV) ──► 导入模块(预览→校验→确认) ─┐
官方自动站当前快照 ──► 手动拉取(默认关/30min缓存) ─┤
                                              ├─► FastAPI(Python 3.12)
MQTTX / 场景模拟器(S1–S5,固定seed) ─► Mosquitto ─► paho 订阅 ┘  规则引擎 / 8态事件状态机
                                                                证据 / 再评估 / 盲区 / 任务
                                                                     ▼
                                              SQLite(WAL) + 统一推送 Hub
                                        ┌──────────────┴───────────────┐
                                 SSE /api/stream                WS /api/ws
                                        │                              │
                            PC Web (React+Vite+R3F)      微信小程序（原生 TS）
```

- PC Web 与小程序**均不直连 MQTT Broker**；双端共用同一后端、数据库与事件模型。
  本地演示模式免登录；公网部署须重新启用 JWT 鉴权与接入控制。
- 核心研判（异常检测、事件状态、任务流转）全部为**可单测的确定性规则**；
  LLM/RAG 为 M3 之后的可选增强，只做证据解释/报告辅助，不生成证据、不控制状态机。

## 目录

| 目录 | 说明 |
|---|---|
| `backend/` | FastAPI 后端：规则引擎、8 态状态机、MQTT 接入（M1）、REST/SSE/WS、SQLite |
| `frontend/` | PC Web 监测指挥中心（React 18 + TS + Vite + React Three Fiber） |
| `miniprogram/` | 微信原生小程序移动巡检端（TypeScript，独立工程，测试号开发版） |
| `simulator/` | S1–S5 场景发布器（M1）：固定 seed，暂停/加速/重置/故障注入 |
| `data/` | SQLite、官方月报原件、上传附件、样例与种子（运行时文件不入库） |
| `docs/` | 架构、API 契约、数据字典、MQTT 协议、演示脚本（随里程碑补充） |

## 环境要求

- Python 3.12（独立 venv，不污染系统 Python）
- Node.js 20+（已在 24 验证）
- [Mosquitto](https://mosquitto.org/) MQTT Broker（本机开发；M1 起必需）
- 微信开发者工具 + 测试号（仅小程序端需要）

## 快速启动（开发期）

三个终端，按顺序：

```bash
# 1) MQTT Broker（Windows 服务或命令行；本机已安装时确认 1883 在监听）
mosquitto -c mosquitto.conf

# 2) 后端（首次需初始化）
cd backend
py -3.12 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe scripts/init_db.py
.venv/Scripts/python.exe scripts/seed_data.py
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

# 3a) PC Web
cd frontend
npm install
npm run dev          # http://localhost:5173

# 3b) 小程序：微信开发者工具导入 miniprogram/ 目录，填入测试号 AppID
#     config/env.ts 模拟器用 127.0.0.1:8000；真机改为电脑局域网 IP
```

验证：

- 后端健康检查 http://127.0.0.1:8000/api/health → `{"status":"ok",...}`
- 接口文档 http://127.0.0.1:8000/api/docs
- PC：http://localhost:5173 ，本地演示模式**免登录**，打开直达 P01 综合监测总览
- 小程序：本地演示模式**免登录**，打开直达任务首页（真机需同 WiFi + 局域网 IP + 勾选“不校验合法域名/TLS”）
- 官方实时快照默认不自动抓取：在 P12「官方实时水质数据」手动拉取（见下文）

重置演示数据：`backend/.venv/Scripts/python.exe scripts/reset_db.py --yes`

## 测试

```bash
cd backend && .venv/Scripts/python.exe -m pytest        # 规则/状态机/契约/API/实时通道
cd frontend && npm run typecheck && npm run build       # 类型检查 + 生产构建
cd miniprogram && npm install && npx tsc --noEmit       # 小程序类型检查
```

## 里程碑

- **M0** 工程基线：三端工程、24 张表、Pydantic 契约、规则与状态机、JWT、SSE/WS Hub、种子数据
- **M1** 数据链：MQTT 正常接入（去重/乱序/迟到/死信/LWT/看门狗）、观测与诊断 API、
  官方月报预览→确认→撤销、P01/P02/P12、S1 场景、**3D 河流全景**
- **M2** 异常事件：滑动窗口变化检测、8 态事件机、跨断面时序关系与 Focus、
  S2/S3 虚拟时钟场景、P03 事件中心、P04 研判工作台（人工操作+409）、
  **3D 镜头飞行/节点详情/异常脉冲**
- **M3** 研判闭环：证据/假设、再评估版本、S4 反例（不扩展+假设降级）、
  S5 监测盲区（离线阻断恢复、迟到补数再评估）、巡检任务 PC↔小程序闭环、
  P05/P06（含规则 vs ML 对照）/P08 研判单/P09 月报统计
- **M4（当前）** 联调交付：S1–S5 真实 broker 端到端回归、故障矩阵 D1–D5、
  P12 场景一键控制台、P11 语音转写（可降级手动）、部署与演示文档

### 场景演示

P12 场景控制台（管理员）可一键启动；或命令行：

```bash
# 后端需 MQTT_ENABLED=true；simulator 发布到本机 Mosquitto
cd simulator
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S1   # 稳定基线（零事件）
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S2 --speed 4  # A→B 单事件
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S3 --speed 6  # A→B→C
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S4 --speed 8  # 反例
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S5 --speed 10 # 盲区
```

- 演示话术：见 [docs/demo-script.md](docs/demo-script.md)
- 真实 broker 端到端回归：`backend/.venv/Scripts/python.exe scripts/e2e_scenarios.py`
- 故障矩阵（需 broker）：`pytest tests/test_failure_matrix.py`
- 语音能力：见 [docs/voice-field-input.md](docs/voice-field-input.md)

## 官方自动监测实时数据（OFFICIAL_AUTO）

- **来源**：国家地表水自动监测实时数据发布系统（中国环境监测总站），
  `POST https://szzdjc.cnemc.cn:8070/GJZ/Ajax/Publish.ashx`。
- **实测口径（2026-10-25）**：全站 980 行均为当日 `00:00` 快照，平台无公开历史序列接口；
  本系统只保存当前快照，不插值、不伪造连续趋势。
- **站点映射**（示意关联，上下游对应待核）：`reach-a ↔ 余家湖`、`reach-b ↔ 转斗`、`reach-c ↔ 新沟闸`。
- **接口**：`GET /api/official/auto?reachId=`、`GET /api/official/auto/status`、
  `POST /api/official/auto/refresh?force=true`。
- **使用约束**：默认关闭（`OFFICIAL_AUTO_ENABLED=false`），仅在 P12 手动拉取；
  同一站点 30 分钟缓存、多站查询节流；数据缺失显示「暂无数据」，超过 25 小时标记过期；
  采集失败写入死信并降级，不影响 MQTT 模拟链路与事件机。
- 官方实时水质与 MQTT 模拟观测分表存储（`official_auto_records` vs `observations`），禁止互相污染。

## 边界声明

- 辅助研判原型，不替代官方监测、法定预警或专业人员最终判断；不做污染源自动定性。
- `demo-rules-v1` 阈值（水位 8.5/7.0 m、浊度 60 NTU）为教学演示规则，非官方标准。
- 月报水质类别保留原始口径，不插值为小时级连续曲线；时序先后不等于因果。
