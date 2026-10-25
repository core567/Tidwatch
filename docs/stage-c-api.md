# C 阶段新增接口验证（cURL 样例）

阶段 C 新增：统一业务时间线、规则处置建议、事件允许动作（`allowedActions`）。
全部只读（除登录外），不改变任何业务状态。

## 0. 认证

除 `GET /api/health` 外，接口需 JWT。本地演示模式用账号换取令牌：

```bash
# 登录（请把 <password> 换成你的口令，勿把真实口令写进脚本或提交）
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<password>"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# 后续请求统一带头
AUTH="Authorization: Bearer $TOKEN"
curl -s http://127.0.0.1:8000/api/health
```

> 下列响应为开发库真实返回的脱敏摘录；`bev-*` 为审计事件 ID，`occurredAt` 为业务发生时间（UTC），`source` 为 `live`（实时写入）或 `backfill`（迁移重建）。

## 1. 事件时间线

`GET /api/events/{event_id}/timeline`，可选 `?types=EVENT,TASK,...`（逗号分隔 biz_type）。

```bash
curl -s "http://127.0.0.1:8000/api/events/TW-001/timeline" -H "$AUTH"
curl -s "http://127.0.0.1:8000/api/events/TW-002/timeline" -H "$AUTH"
# 仅看任务类
curl -s "http://127.0.0.1:8000/api/events/TW-001/timeline?types=TASK" -H "$AUTH"
# 未知事件 -> 404
```

事件按 `occurredAt` 升序，把状态迁移、任务、证据、评估、盲区合并在一条时间线上（不拼装 run_traces）。

TW-002 响应头部（节选，当前库共 41 条）：

```json
{
  "items": [
    {
      "eventId": "bev-…", "bizType": "EVENT", "actionType": "event.status-changed",
      "eventRef": "TW-002", "taskRef": null, "actor": "SYSTEM",
      "fromStatus": null, "toStatus": "OPEN",
      "description": "首次识别持续变化", "evidenceRefs": [],
      "occurredAt": "2026-10-25T10:36:59.860749", "source": "backfill"
    },
    {
      "eventId": "bev-…", "bizType": "EVENT", "actionType": "event.status-changed",
      "eventRef": "TW-002", "fromStatus": "OPEN", "toStatus": "INVESTIGATING",
      "description": "连续异常采样确认，建立活动事件",
      "occurredAt": "2026-10-25T10:36:59.860749", "source": "backfill"
    },
    {
      "eventId": "bev-…", "bizType": "TASK", "actionType": "task.created",
      "eventRef": "TW-002", "taskRef": "tsk-b39b051e0ee04f7f",
      "toStatus": "PENDING",
      "description": "上游断面已出现同向持续变化，下游为下一观察重点（时序先后不构成因果证明）",
      "evidenceRefs": ["tsk-b39b051e0ee04f7f"],
      "occurredAt": "2026-10-25T10:37:00.425156", "source": "backfill"
    }
  ]
}
```

- TW-001 当前库 11 条（8 次状态迁移 + 任务 created/accepted/started）。
- TW-002 当前库 41 条（含 S1/S5 等场景真实产生的 `blindspot.opened/resolved`，及 live 的 `NARROWED→INVESTIGATING`）。
- `?types=TASK` 实测只返回 `bizType=TASK` 的条目（TW-001 为 3 条）。

## 2. 巡检任务时间线

`GET /api/inspection-tasks/{task_id}/timeline`，同样支持 `?types=`。

```bash
curl -s "http://127.0.0.1:8000/api/inspection-tasks/tsk-3ae89d2592744a83/timeline" -H "$AUTH"
```

任务时间线 = 本任务自身动作（created/accepted/started/submitted）+ 其所属事件上与具体任务无关的事件级动作。`tsk-3ae89…`（关联 TW-001）当前 11 条，顺序为：

```
EVENT OPEN → EVENT INVESTIGATING → TASK created(PENDING) →
EVENT MONITORING → EVENT RECOVERY_PENDING → EVENT RECOVERED →
EVENT INVESTIGATING → TASK accepted(ACCEPTED) → TASK started(IN_PROGRESS) →
EVENT RECOVERY_PENDING → EVENT RECOVERED
```

## 3. 处置建议（规则，非 AI）

`GET /api/events/{event_id}/recommendations`，返回确定性规则建议，不改变状态。

```bash
curl -s "http://127.0.0.1:8000/api/events/TW-002/recommendations" -H "$AUTH"
```

```json
{
  "eventId": "TW-002", "source": "RULE", "ruleVersion": "demo-rules-v1",
  "items": [
    { "code": "RESOLVE_BLINDSPOT", "category": "BLINDSPOT", "title": "范围内存在监测盲区",
      "reason": "断面 reach-a, reach-b, reach-c 数据链路中断，恢复判定前必须先补数/排除故障。",
      "priority": "HIGH", "reachIds": ["reach-a", "reach-b", "reach-c"] },
    { "code": "DECIDE_SCOPE", "category": "EVENT_ACTION", "title": "收窄范围或持续观察",
      "reason": "研判中：证据支持范围明确可收窄，证据不足则保持持续观察。",
      "priority": "NORMAL", "scopeReachIds": ["reach-a", "reach-b", "reach-c"] }
  ]
}
```

- TW-001（RECOVERED）：`RESOLVE_BLINDSPOT`（HIGH，若仍有开放盲区）+ `REVIEW_RECOVERED`（LOW，引导复盘）。
- 有 `SUBMITTED` 任务时建议首项为 `REVIEW_SUBMISSION`；升级且缺人工证据时给 `ADD_MANUAL_EVIDENCE`。

## 4. 事件详情中的 allowedActions

`GET /api/events/{event_id}` 的 `allowedActions` 由后端 8 态状态机实时计算，前端只据此渲染按钮。

```bash
curl -s "http://127.0.0.1:8000/api/events/TW-001" -H "$AUTH" | python -m json.tool | grep -A2 allowedActions
curl -s "http://127.0.0.1:8000/api/events/TW-002" -H "$AUTH" | python -m json.tool | grep -A6 allowedActions
```

| 事件 | status | allowedActions |
|---|---|---|
| TW-001 | `RECOVERED` | `REOPEN` |
| TW-002 | `INVESTIGATING` | `ESCALATE, KEEP_MONITORING, NARROW_SCOPE, MARK_RECOVERY_PENDING, MARK_UNRESOLVED` |

非法迁移（如对 INVESTIGATING 执行 `REOPEN`，不在 allowedActions 内）返回 **409**：

```bash
curl -s -X POST http://127.0.0.1:8000/api/events/TW-002/actions -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"action":"REOPEN"}' -w '\nHTTP:%{http_code}\n'
# HTTP:409
```

## 5. 幂等与一致性

```bash
# 迁移脚本可重复执行，已回填的业务键跳过，不产生重复 business_events
cd backend && .venv/Scripts/python.exe scripts/migrate_v2.py
# 第二次：event.status-changed 0、task 0、skipped 等于已有回填数
```

同一事件同一时刻的多条迁移（如 OPEN 与自动 START_INVESTIGATING）按 `from/to` 完整键区分，不会被误并。
