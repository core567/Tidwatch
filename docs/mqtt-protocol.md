# MQTT 协议与 MQTTX 操作卡（M1）

## Broker

- 本机 Mosquitto：`127.0.0.1:1883`（MQTT），`8083`（WebSocket）
- 匿名访问；后端以 clientId `tidewatch-backend` 订阅

## Topic（前缀 `tidewatch/v1`）

| Topic | 方向 | 说明 |
|---|---|---|
| `tidewatch/v1/reach-a/observation` | 发布 | 上游 A 观测消息 |
| `tidewatch/v1/reach-b/observation` | 中游 B | |
| `tidewatch/v1/reach-c/observation` | 下游 C | |
| `tidewatch/v1/{reachId}/heartbeat` | 发布 | 心跳（任意内容，断面置 ONLINE） |
| `tidewatch/v1/{reachId}/status` | 发布 | `{"status":"ONLINE"}` / `{"status":"OFFLINE"}`（LWT 同此格式） |

## observation 消息格式（多指标快照，QoS 1）

```json
{
  "messageId": "manual-001",
  "reachId": "reach-a",
  "observedAt": "2026-10-21T12:00:00+08:00",
  "scenarioId": "S1",
  "sourceType": "SIMULATED",
  "seq": 1,
  "metrics": {
    "waterLevel": { "value": 4.5, "unit": "m", "qualityFlag": "GOOD" },
    "turbidity": { "value": 20, "unit": "NTU", "qualityFlag": "GOOD" },
    "flowLevel": {
      "value": 1,
      "unit": "enum0-3",
      "qualityFlag": "GOOD",
      "perceptionSource": "SIMULATED",
      "confidence": null
    }
  }
}
```

约束（违反则入死信 `ingestion_errors`，不污染数据）：

- `messageId` 必填且全局唯一，重复投递只生效一次；
- topic 中的 reachId 必须与 payload 一致；断面必须是 reach-a/b/c；
- 单位必须与指标字典一致：waterLevel=m（量程 0–30），turbidity=NTU（0–1000），flowLevel=enum0-3（0–3）；
- **不要发送 status 字段**，环境判级由后端 `demo-rules-v1` 计算；
- observedAt 用 ISO 8601；迟到/乱序允许，按 observedAt 组织时间线。

## MQTTX 故障注入演示（D4）

1. **坏 JSON**：payload 发 `{broken` → 页面诊断可见 INVALID_JSON 死信；
2. **错 topic**：发到 `tidewatch/v1/reach-x/observation` → UNKNOWN_REACH；
3. **重复消息**：同一 messageId 连发两次 → 只入库一次（duplicate_count=1）；
4. **停发数据**：停止发送 30 秒 → 看门狗把断面置 STALE；
5. **断面离线**：向 status topic 发 `{"status":"OFFLINE"}`（或断开带 LWT 的客户端）。
