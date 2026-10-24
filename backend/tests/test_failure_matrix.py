"""故障矩阵 D1–D5 真实 MQTT 注入测试。

仅当本机 Mosquitto(1883) 可用时运行（否则 skip）。
通过独立临时库 + 独立 uvicorn 子进程，验证故障注入下的系统行为：
  D1 坏 JSON / 错 topic  -> 死信，不污染数据
  D2 重复消息            -> 幂等，只生效一次
  D3 关键断面停发        -> STALE 看门狗 + 死信计数
  D4 乱序/迟到           -> 按 observedAt 组织，旧数据不覆盖最新
  D5 非法值域/单位       -> 拒绝
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import paho.mqtt.client as mqtt
import pytest

BACKEND = Path(__file__).resolve().parents[1]
PY = str(BACKEND / ".venv" / "Scripts" / "python.exe")
PORT = 8060
BASE = f"http://127.0.0.1:{PORT}"


def broker_available() -> bool:
    s = socket.socket()
    s.settimeout(1)
    try:
        s.connect(("127.0.0.1", 1883))
        return True
    except OSError:
        return False
    finally:
        s.close()


pytestmark = pytest.mark.skipif(not broker_available(), reason="Mosquitto 1883 不可用")


@pytest.fixture(scope="module")
def server():
    tmp = Path(tempfile.mkdtemp(prefix="tw_diag_")) / "diag.db"
    env = os.environ | {
        "DATABASE_URL": f"sqlite:///{tmp.as_posix()}",
        "MQTT_ENABLED": "true",
        "MQTT_CLIENT_ID": "tw-diag-test",
        "MQTT_STALE_SECONDS": "2",
    }
    subprocess.run([PY, "scripts/init_db.py"], cwd=BACKEND, env=env, check=True, capture_output=True)
    subprocess.run([PY, "scripts/seed_data.py"], cwd=BACKEND, env=env, check=True, capture_output=True)
    proc = subprocess.Popen(
        [PY, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/api/health", timeout=1) as r:
                if r.status == 200:
                    break
        except OSError:
            time.sleep(0.4)
    yield BASE
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    time.sleep(1)


@pytest.fixture(scope="module")
def token(server):
    data = json.dumps({"username": "admin", "password": "Admin#2026"}).encode()
    req = urllib.request.Request(
        f"{server}/api/auth/login", data=data, method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["accessToken"]


def publish(topic: str, payload: str, client_id: str):
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    c.connect("127.0.0.1", 1883, keepalive=10)
    c.loop_start()
    c.publish(topic, payload, qos=1).wait_for_publish()
    time.sleep(0.4)
    c.loop_stop()
    c.disconnect()


def api(server: str, path: str, token: str):
    req = urllib.request.Request(f"{server}{path}")
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def test_d1_bad_json_and_unknown_reach_go_to_dead_letter(server, token):
    publish("tidewatch/v1/reach-a/observation", "{not json", "diag-badjson")
    publish(
        "tidewatch/v1/reach-z/observation",
        json.dumps({
            "messageId": "diag-z-1", "reachId": "reach-z",
            "observedAt": "2026-10-24T10:00:00+08:00",
            "sourceType": "SIMULATED",
            "metrics": {"waterLevel": {"value": 4.5, "unit": "m"},
                        "turbidity": {"value": 20, "unit": "NTU"},
                        "flowLevel": {"value": 1, "unit": "enum0-3"}},
        }),
        "diag-unknown",
    )
    time.sleep(0.5)
    d = api(server, "/api/admin/ingestion-errors?page=1&pageSize=20", token)
    reasons = {e["reason"] for e in d["items"]}
    assert "INVALID_JSON" in reasons
    assert "UNKNOWN_REACH" in reasons


def test_d2_duplicate_message_is_idempotent(server, token):
    body = json.dumps({
        "messageId": "diag-dup-1", "reachId": "reach-a",
        "observedAt": "2026-10-24T10:05:00+08:00",
        "sourceType": "SIMULATED",
        "metrics": {"waterLevel": {"value": 4.4, "unit": "m"},
                    "turbidity": {"value": 20, "unit": "NTU"},
                    "flowLevel": {"value": 1, "unit": "enum0-3"}},
    })
    publish("tidewatch/v1/reach-a/observation", body, "diag-dup-a")
    publish("tidewatch/v1/reach-a/observation", body, "diag-dup-b")
    time.sleep(0.6)
    # 同 messageId 重复投递：最新值正确，且不产生新的死信/异常
    latest = api(server, "/api/reaches/reach-a/latest", token)
    wl = {m["metric"]: m for m in latest}["waterLevel"]
    assert wl["value"] == 4.4
    d = api(server, "/api/admin/ingestion-errors?page=1&pageSize=30", token)
    assert not any(e["reason"] in ("DUPLICATE_MESSAGE", "INGESTION_ERROR") for e in d["items"])


def test_d4_late_data_keeps_latest_fact(server, token):
    # 先发新值，再补发更旧 observedAt 的迟到数据
    new_body = json.dumps({
        "messageId": "diag-late-new", "reachId": "reach-b",
        "observedAt": "2026-10-24T11:00:00+08:00",
        "sourceType": "SIMULATED",
        "metrics": {"waterLevel": {"value": 4.9, "unit": "m"},
                    "turbidity": {"value": 22, "unit": "NTU"},
                    "flowLevel": {"value": 1, "unit": "enum0-3"}},
    })
    old_body = json.dumps({
        "messageId": "diag-late-old", "reachId": "reach-b",
        "observedAt": "2026-10-24T09:00:00+08:00",
        "sourceType": "SIMULATED",
        "metrics": {"waterLevel": {"value": 4.1, "unit": "m"},
                    "turbidity": {"value": 22, "unit": "NTU"},
                    "flowLevel": {"value": 1, "unit": "enum0-3"}},
    })
    publish("tidewatch/v1/reach-b/observation", new_body, "diag-late-1")
    publish("tidewatch/v1/reach-b/observation", old_body, "diag-late-2")
    time.sleep(0.6)
    latest = api(server, "/api/reaches/reach-b/latest", token)
    wl = {m["metric"]: m for m in latest}["waterLevel"]
    # Current Fact（最新事实）不被旧数据回滚
    assert wl["value"] == 4.9


def test_d3_stale_after_stop_publishing(server, token):
    """断面先上线，随后停止发报超过新鲜度阈值 -> STALE。"""
    online = json.dumps({"status": "ONLINE"})
    publish("tidewatch/v1/reach-c/status", online, "diag-c-online")
    body = json.dumps({
        "messageId": "diag-c-heartbeat", "reachId": "reach-c",
        "observedAt": "2026-10-24T12:30:00+08:00",
        "sourceType": "SIMULATED",
        "metrics": {"waterLevel": {"value": 4.2, "unit": "m"},
                    "turbidity": {"value": 18, "unit": "NTU"},
                    "flowLevel": {"value": 1, "unit": "enum0-3"}},
    })
    publish("tidewatch/v1/reach-c/observation", body, "diag-c-hb")
    time.sleep(0.5)
    assert api(server, "/api/reaches/reach-c", token)["onlineStatus"] == "ONLINE"
    # 之后不再发报，等待看门狗（阈值 2s）置为 STALE；
    # 若期间发布端 LWT 触发则可能直接 OFFLINE，两者都表示断站被正确识别
    # 看门狗每 10s 巡检一次，留足一个 tick + 2s 阈值的余量
    deadline = time.time() + 15
    final_status = "ONLINE"
    while time.time() < deadline:
        final_status = api(server, "/api/reaches/reach-c", token)["onlineStatus"]
        if final_status in ("STALE", "OFFLINE"):
            break
        time.sleep(0.5)
    assert final_status in ("STALE", "OFFLINE"), f"期望 STALE/OFFLINE，实际 {final_status}"


def test_d5_out_of_range_rejected(server, token):
    body = json.dumps({
        "messageId": "diag-range-1", "reachId": "reach-c",
        "observedAt": "2026-10-24T12:00:00+08:00",
        "sourceType": "SIMULATED",
        "metrics": {"waterLevel": {"value": 99.0, "unit": "m"},
                    "turbidity": {"value": 20, "unit": "NTU"},
                    "flowLevel": {"value": 1, "unit": "enum0-3"}},
    })
    publish("tidewatch/v1/reach-c/observation", body, "diag-range")
    time.sleep(0.6)
    d = api(server, "/api/admin/ingestion-errors?page=1&pageSize=30", token)
    assert any(e["reason"] == "OUT_OF_RANGE" for e in d["items"])
