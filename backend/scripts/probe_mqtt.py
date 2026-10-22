"""M1-1 真实链路探针：经 Mosquitto 发布 4 条消息（含重复/坏消息）。"""
import json
import time

import paho.mqtt.client as mqtt

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="tw-e2e-probe")
c.connect("127.0.0.1", 1883, 30)
c.loop_start()
time.sleep(0.5)

topic = "tidewatch/v1/reach-a/observation"
base = {
    "messageId": "e2e-001",
    "reachId": "reach-a",
    "observedAt": "2026-10-21T23:30:00+08:00",
    "scenarioId": "S1",
    "sourceType": "SIMULATED",
    "metrics": {
        "waterLevel": {"value": 4.5, "unit": "m"},
        "turbidity": {"value": 20, "unit": "NTU"},
        "flowLevel": {"value": 1, "unit": "enum0-3"},
    },
}
raw = json.dumps(base, ensure_ascii=False)

c.publish(topic, raw, qos=1)                 # 正常
time.sleep(0.5)
c.publish(topic, raw, qos=1)                 # 重复
time.sleep(0.5)
c.publish(topic, "{broken json", qos=1)      # 坏 JSON
time.sleep(0.5)
bad = json.loads(raw)
bad["messageId"] = "e2e-002"
bad["metrics"]["waterLevel"]["value"] = 9999 # 超量程
c.publish(topic, json.dumps(bad), qos=1)
time.sleep(1.5)
c.loop_stop()
c.disconnect()
print("published 4 messages")
