# TideWatch Backend

Python 3.12 + FastAPI + SQLite。REST API + SSE/WS 实时推送 + MQTT 接入（M1）。

> 本地演示模式：REST/SSE/WS 均**免鉴权**（`deps.py` 返回固定演示用户）。
> 公网部署必须重新启用 JWT 校验与接入控制。

## 环境准备

```bash
cd backend
py -3.12 -m venv .venv

# Windows
.venv/Scripts/python.exe -m pip install -r requirements.txt
# 如默认源不通，可临时使用清华镜像（不写死，按需选择）：
# .venv/Scripts/python.exe -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

精确版本见 `requirements-lock.txt`（`pip freeze` 生成，用于复现）。

## 初始化数据库与种子数据

```bash
.venv/Scripts/python.exe scripts/init_db.py    # 建表（28 张）
.venv/Scripts/python.exe scripts/seed_data.py  # 幂等种子：账号/监测点/指标/规则
```

重置（删表重建 + 重新种子，会清空现有数据，需输入 yes 或加 `--yes`）：

```bash
.venv/Scripts/python.exe scripts/reset_db.py --yes
```

数据库默认在仓库根 `data/tidewatch.db`（SQLite WAL）。

## 启动

```bash
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

- 健康检查：http://127.0.0.1:8000/api/health
- 接口文档（开发期）：http://127.0.0.1:8000/api/docs
- SSE：`GET /api/stream`（PC Web，本地演示免 token；带 token 仍兼容）
- WebSocket：`/api/ws[?resumeFrom=<messageId>]`（小程序，本地演示免 token）
- 官方实时水质：`GET /api/official/auto?reachId=`、`GET /api/official/auto/status`、
  `POST /api/official/auto/refresh?force=true`（默认关闭，P12 手动拉取）

## 种子账号（保留用户表；本地演示模式不校验登录）

| 账号 | 密码 | 角色 |
|---|---|---|
| admin | Admin#2026 | 系统管理员 |
| analyst | Analyst#2026 | 监测分析人员 |
| inspector | Inspector#2026 | 巡检人员（小程序演示用） |

## 小程序联调

1. 启动本服务；
2. 微信开发者工具模拟器：`miniprogram/config/env.ts` 用 `127.0.0.1:8000`；
   真机：改为电脑局域网 IP（同 WiFi），并在工具中勾选“不校验合法域名/TLS”；
3. 本地演示模式免登录，打开即进入任务首页。

## 测试

```bash
.venv/Scripts/python.exe -m pytest
```

覆盖：教学阈值判级（C02 四组回归数据）、8 态事件状态机（含非法迁移拒绝）、
Pydantic 契约（camelCase/严格校验）、health/login/SSE/WS。

## 配置

复制 `.env.example` 为 `.env` 修改；`.env` 不入库。JWT 生产密钥请用
`python -c "import secrets;print(secrets.token_hex(32))"` 重新生成。

官方自动站实时快照：`OFFICIAL_AUTO_ENABLED`（默认 false）、
`OFFICIAL_AUTO_CACHE_MINUTES=30`、`OFFICIAL_AUTO_STALE_MINUTES=1500`、
`OFFICIAL_AUTO_REQUEST_INTERVAL_SECONDS=1.5`（多站节流，避免触发平台反爬）。

## AI 智能助手（H 阶段）

- 接口：`GET /api/ai/status`、`POST /api/ai/chat`（只读业务问答 + 安全的导航/视角指令）。
- 双层：未配置大模型时运行**规则工具模式**（查询真实水位/事件/任务/恢复评估）；配置后启用 OpenAI 兼容大模型工具调用，失败自动降级为规则模式并提示。
- 配置（写入 `.env`，勿入库）：
  - `AI_ENABLED=true`、`AI_API_KEY=`、`AI_BASE_URL=`（如 `https://api.deepseek.com/v1` 或通义 `.../compatible-mode/v1`）、`AI_MODEL=`
  - `AI_TIMEOUT_SECONDS=20`、`AI_MAX_TOOL_ROUNDS=4`、`AI_MAX_OUTPUT_TOKENS=800`
- AI 仅可读，不直接派发/复核/关闭；不同模型的工具调用能力可能不同，首次配置后以 `/api/ai/status` 与实际问答验证。
