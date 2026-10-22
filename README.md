# TideWatch V1.0

**汉江武汉段多断面异常演化研判与巡检辅助系统**（竞赛作品）。
核心不是数据大屏，而是把 **观测 → 变化识别 → 活动事件 → 时序关系 → 证据/假设 →
观察重点 → 巡检 → 后续证据再评估 → 事件复盘** 串成可追溯、可复核、可复盘的工作流。

> 数据原则：**公开历史资料（月度水质类别）+ 明确标识的 MQTT 模拟连续数据 + 可追溯事件证据**。
> 模拟数据在全站、接口与导出物中显式标记；未核实官方实时接口前不声称实时接入；
> 真实站点坐标/上下游未核实前使用逻辑节点 A/B/C 并标注「示意拓扑」。

## 总体架构

```
官方月报(HTML/CSV) ──► 导入模块(预览→校验→确认) ─┐
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

- PC Web 与小程序**均不直连 MQTT Broker**；双端共用同一后端、数据库、JWT 鉴权与事件模型。
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
- PC：http://localhost:5173 ，登录 admin/analyst/inspector（密码见 [backend/README.md](backend/README.md)）
- 小程序：inspector 账号登录（真机需同 WiFi + 局域网 IP + 勾选“不校验合法域名/TLS”）

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
- **M2（当前）** 异常事件：滑动窗口变化检测、8 态事件机、跨断面时序关系与 Focus、
  S2/S3 虚拟时钟场景、P03 事件中心、P04 研判工作台（人工操作+409）、
  **3D 镜头飞行/节点详情/异常脉冲**
- **M3** 研判闭环：证据/再评估/盲区/巡检派发/研判单/月报分析、S4/S5、
  小程序业务对接、规则 vs ML
- **M4** 联调交付：S1–S5 回归、故障矩阵、部署与演示材料

### 场景演示

```bash
# 后端需 MQTT_ENABLED=true；simulator 发布到本机 Mosquitto
cd simulator
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S1   # 稳定基线（零事件）
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S2 --speed 4  # A→B 单事件
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S3 --speed 6  # A→B→C
```

真实 broker 端到端回归：`backend/.venv/Scripts/python.exe scripts/e2e_scenarios.py`

## 边界声明

- 辅助研判原型，不替代官方监测、法定预警或专业人员最终判断；不做污染源自动定性。
- `demo-rules-v1` 阈值（水位 8.5/7.0 m、浊度 60 NTU）为教学演示规则，非官方标准。
- 月报水质类别保留原始口径，不插值为小时级连续曲线；时序先后不等于因果。
