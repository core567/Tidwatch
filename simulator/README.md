# simulator（M1 实现）

S1–S5 场景发布器，M1 阶段实现：

- 经 paho-mqtt 向本机 Mosquitto 发布 `tidewatch/v1/{reachId}/observation` 消息；
- 每个场景固定 `scenarioId + seed`，可暂停 / 倍速 / 重置 / 故障注入（停发、重复、乱序、迟到）；
- 既可由后端场景 API 驱动，也可脱离后端用 MQTTX 手动发送（附 MQTTX 连接模板与操作卡）。

场景节奏（规划基线）：
S1 稳定基线 · S2 A→B 先后变化（下一观察重点 C）· S3 C 同向变化扩范围（Golden Demo）·
S4 B 回落 C 稳定不扩展（反例）· S5 C 离线形成盲区，补迟到数据后再评估。
