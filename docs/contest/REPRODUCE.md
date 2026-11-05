# TideWatch 第三方交叉复现记录

> 目的：让未参与开发的第三方按统一步骤独立复现，并如实记录结果。
> **当前状态：尚未由第三方执行。** 本文所有步骤为待执行清单，结果栏默认「未验证」；项目维护者的本地验证记录见 README 第 11 节，不等同于第三方复现。

---

## 1. 复现信息登记

| 项 | 填写内容 |
|---|---|
| 复现人 | 待填写 |
| 复现日期 | 待填写 |
| 操作系统与版本 | 待填写 |
| Python 版本 | 待填写（要求 3.12） |
| Node.js / npm 版本 | 待填写（要求 Node 20+） |
| 浏览器与版本 | 待填写（3D 需 WebGL） |
| MQTT Broker | 无 / Mosquitto 版本：待填写 |
| 微信开发者工具版本 | 无 / 待填写 |
| 复现分支 | `fusion/f2-overview-migration` |
| 复现 Commit | `2fa77e2918f60ac9a6d5accc2039692e29deec72`（或实际 checkout 的哈希） |
| 数据库路径 | 默认 `data/tidewatch.db` / 自定义：待填写 |

---

## 2. 复现步骤与判定标准

> 状态列填写：**通过 / 失败 / 阻塞 / 未验证**。未实际执行的步骤不要填「通过」。

### 2.1 代码获取

```bash
git clone https://github.com/core567/Tidwatch.git
cd Tidwatch
git checkout fusion/f2-overview-migration
git rev-parse HEAD
```

- 期望：`git rev-parse HEAD` 输出与登记 Commit 一致（或记录实际哈希）。
- 状态：未验证

### 2.2 后端启动

```bash
cd backend
py -3.12 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
cp .env.example .env
.venv/Scripts/python.exe scripts/init_db.py
.venv/Scripts/python.exe scripts/seed_data.py
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

macOS/Linux 使用 `python3.12` 与 `.venv/bin/python`。

- 期望：`curl http://127.0.0.1:8000/api/health` 返回 `{"status":"ok","database":"ok",...}`。
- 记录：实际返回内容：待填写。
- 状态：未验证

### 2.3 前端启动

```bash
cd frontend
npm install
npm run dev
```

- 期望：打开 `http://localhost:5173`，无需登录即可看到智慧监测总览。
- 记录：首屏是否正常、控制台是否有报错：待填写。
- 状态：未验证

### 2.4 自动化测试

```bash
# 后端（排除需要外部 Broker 的故障矩阵）
cd backend
.venv/Scripts/python.exe -m pytest tests --ignore=tests/test_failure_matrix.py

# 前端
cd ../frontend
npm run typecheck
npm run build
npm run test:3d
npm run test:alerts

# 小程序
cd ../miniprogram
npm install
npm test
```

- 期望（维护者本地记录，供对照，不作为第三方结论）：后端 165 passed；3D 60 passed；告警 14 passed；小程序 55 passed；typecheck/build 通过。
- 记录第三方实际输出：待填写。
- 状态：未验证

### 2.5 无 Broker 场景验证

| 检查项 | 操作 | 期望 | 状态 |
|---|---|---|---|
| 总览加载 | 打开 `/` | 断面、指标、趋势可见，无接口错误 | 未验证 |
| 可选演示观测 | `cd backend && .venv/Scripts/python.exe scripts/seed_demo_observations.py --days 3 --interval-min 5` | 图表出现近 3 天观测 | 未验证 |
| 任务创建/派发 | `/tasks` → 新建任务 → 存草稿/直接派发 | 列表出现 DRAFT/PENDING | 未验证 |
| 任务复核 | 打开任务详情 → 复核动作（需先提交） | 状态按 7 态流转 | 未验证 |
| 复盘 PDF | `/review/:eventId/report` | 可预览并下载 PDF | 未验证 |
| AI 规则模式 | `/assistant` 提问“当前哪些断面异常” | 返回规则模式答案与来源 | 未验证 |
| 全局告警 | 已有事件时等待轮询 | 铃铛未读与历史可用 | 未验证 |

### 2.6 有 Broker 场景验证（可选）

```bash
# 1) 启动 Mosquitto（默认 1883）
mosquitto -v

# 2) backend/.env 设置 MQTT_ENABLED=true 后重启后端

# 3) 运行场景
cd simulator
../backend/.venv/Scripts/python.exe run_scenario.py --scenario S2 --speed 4
```

| 检查项 | 期望 | 状态 |
|---|---|---|
| 观测入站 | `/api/admin/diagnostics` 的 observations 增加 | 未验证 |
| 事件生成 | 事件中心出现 S2 对应事件 | 未验证 |
| SSE 推送 | 浏览器 `/api/stream` 保持单连接并收到消息 | 未验证 |
| 全局告警 | 新事件触发告警卡与历史 | 未验证 |
| 告警声音 | 开启声音后严重告警有短促音（需用户手势） | 未验证 |

### 2.7 官方月报导入

1. 打开 `/admin` 的月报导入面板。
2. 上传 `data/samples/wuhan_surface_water_2026-07_hanjiang.csv`。
3. 预览 → 确认 → 查看批次 → 撤销（可选）。

- 期望：预览字段映射正确，确认后统计可见，撤销后批次状态变化。
- 状态：未验证

### 2.8 小程序（可选）

1. 微信开发者工具导入 `miniprogram/`，填写测试号 AppID。
2. 勾选「不校验合法域名、TLS」。
3. 模拟器使用 `config/env.ts` 的 `HOST=127.0.0.1`；真机改为局域网 IP，后端以 `--host 0.0.0.0` 启动。
4. 验证任务接单、现场记录、拍照上传、提交与 PC 复核。

- 状态：未验证

### 2.9 故障矩阵（可选，需隔离环境）

```bash
cd backend
.venv/Scripts/python.exe -m pytest tests/test_failure_matrix.py
```

> 注意：该测试需要 Mosquitto，并会向 Broker 发布故障消息；若演示后端同时订阅同一 Broker，可能污染演示数据库。请在独立 Broker 或停用演示后端后执行。

- 状态：未验证

---

## 3. 结果记录表

| # | 步骤 | 实际结果 | 与期望差异 | 状态 | 证据（日志/截图路径） |
|---|---|---|---|---|---|
| 1 | 代码获取 | 待填写 | 待填写 | 未验证 | 待填写 |
| 2 | 后端健康检查 | 待填写 | 待填写 | 未验证 | 待填写 |
| 3 | 前端首屏 | 待填写 | 待填写 | 未验证 | 待填写 |
| 4 | 后端测试 | 待填写 | 待填写 | 未验证 | 待填写 |
| 5 | 前端测试与构建 | 待填写 | 待填写 | 未验证 | 待填写 |
| 6 | 小程序测试 | 待填写 | 待填写 | 未验证 | 待填写 |
| 7 | 无 Broker 功能 | 待填写 | 待填写 | 未验证 | 待填写 |
| 8 | 有 Broker 场景 | 待填写 | 待填写 | 未验证 | 待填写 |
| 9 | 月报导入 | 待填写 | 待填写 | 未验证 | 待填写 |
| 10 | 小程序联调 | 待填写 | 待填写 | 未验证 | 待填写 |
| 11 | 故障矩阵 | 待填写 | 待填写 | 未验证 | 待填写 |

---

## 4. 复现结论

- 总体结论：**未验证**（尚未由第三方执行）。
- 阻塞项：待填写。
- 建议修复项：待填写。
- 复现人签字 / 日期：待填写。

---

## 5. 已知限制（复现前必读）

1. 当前为本地演示免登录模式，接口无鉴权；仅用于本地/受控环境。
2. 官方连续实时接口未接入；官方快照默认关闭，可能因网络或平台限制失败。
3. AI 大模型需自行配置外部服务；未配置时只有规则模式。
4. 3D 页面需要 WebGL；不支持时自动降级为 2D 示意层。
5. 浏览器告警声音需要用户手势解锁，刷新后可能需要重新开启。
6. 小程序真机需局域网、防火墙放行与开发者工具设置；扫码预览受测试号域名限制。
7. 仓库没有 LICENSE 与当前版本截图；字体授权待核实。
