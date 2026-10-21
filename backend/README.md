# TideWatch Backend

Python 3.12 + FastAPI + SQLite。REST API + SSE/WS 实时推送 + MQTT 接入（M1）。

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
.venv/Scripts/python.exe scripts/init_db.py    # 建表（24 张）
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
- SSE：`GET /api/stream?token=<JWT>`（PC Web）
- WebSocket：`/api/ws?token=<JWT>[&resumeFrom=<messageId>]`（小程序）

## 种子账号（仅限开发演示，正式部署必须修改）

| 账号 | 密码 | 角色 |
|---|---|---|
| admin | Admin#2026 | 系统管理员 |
| analyst | Analyst#2026 | 监测分析人员 |
| inspector | Inspector#2026 | 巡检人员（小程序演示用） |

## 小程序联调

1. 启动本服务；
2. 微信开发者工具模拟器：`miniprogram/config/env.ts` 用 `127.0.0.1:8000`；
   真机：改为电脑局域网 IP（同 WiFi），并在工具中勾选“不校验合法域名/TLS”；
3. 小程序登录页输入 inspector / Inspector#2026。

## 测试

```bash
.venv/Scripts/python.exe -m pytest
```

覆盖：教学阈值判级（C02 四组回归数据）、8 态事件状态机（含非法迁移拒绝）、
Pydantic 契约（camelCase/严格校验）、health/login/SSE/WS。

## 配置

复制 `.env.example` 为 `.env` 修改；`.env` 不入库。JWT 生产密钥请用
`python -c "import secrets;print(secrets.token_hex(32))"` 重新生成。
