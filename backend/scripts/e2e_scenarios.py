"""M4 端到端回归：经真实 Mosquitto + FastAPI(MQTT ingestor) 验证 S1–S5。

前置：Mosquitto 在 127.0.0.1:1883。每场景独立临时库 + 独立 MQTT client_id。
断言要点：
  S1 零事件；S2 单事件 A/B + 540s 时序 + Focus C；S3 范围 A/B/C；
  S4 不扩 C + 假设 NOT_SUPPORT；S5 C 盲区形成（事件未恢复）。
不进 pytest（依赖外部 broker 与端口），供 CI / 人工复核。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import paho.mqtt.client as mqtt

BACKEND = Path(__file__).resolve().parents[1]
SIMULATOR = BACKEND.parent / "simulator"
PY = BACKEND / ".venv" / "Scripts" / "python.exe"
PORT = 8050
BASE = f"http://127.0.0.1:{PORT}"


def http(method: str, path: str, token: str | None = None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def wait_health(timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            s, b = http("GET", "/api/health")
            if s == 200 and b["status"] == "ok":
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("backend not healthy")


def broker_up() -> bool:
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="e2e-check")
    try:
        c.connect("127.0.0.1", 1883, 5)
        c.disconnect()
        return True
    except Exception:
        return False


def run_scenario(scenario: str, speed: int):
    subprocess.run(
        [str(PY), "run_scenario.py", "--scenario", scenario, "--speed", str(speed)],
        cwd=SIMULATOR, check=True, capture_output=True, text=True, timeout=120,
    )


def login() -> str:
    _, b = http("POST", "/api/auth/login", body={"username": "admin", "password": "Admin#2026"})
    return b["accessToken"]


def start_server(client_id: str, db_path: Path, env: dict):
    return subprocess.Popen(
        [str(PY), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    ), env


def stop(server):
    if server is not None and server.poll() is None:
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(server.pid)],
            capture_output=True,
        )
        # 等待监听端口释放，避免下个场景连接到旧进程
        deadline = time.time() + 8
        while time.time() < deadline:
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health", timeout=1)
                time.sleep(0.4)
            except Exception:
                return
        time.sleep(0.5)


def run_one(scenario: str, speed: int, assert_fn) -> tuple[bool, str]:
    tmp = Path(tempfile.mkdtemp(prefix=f"tw_e2e_{scenario.lower()}_")) / "e2e.db"
    env = os.environ | {
        "DATABASE_URL": f"sqlite:///{tmp.as_posix()}",
        "MQTT_ENABLED": "true",
        "MQTT_CLIENT_ID": f"tw-e2e-{scenario}",
    }
    # 先建表 + 种子（无服务占用数据库），再启动唯一的 server
    subprocess.run([str(PY), "scripts/init_db.py"], cwd=BACKEND, env=env, check=True, capture_output=True)
    subprocess.run([str(PY), "scripts/seed_data.py"], cwd=BACKEND, env=env, check=True, capture_output=True)
    server = None
    try:
        server, _ = start_server(f"tw-e2e-{scenario}", tmp, env)
        wait_health()
        time.sleep(1)
        token = login()
        run_scenario(scenario, speed)
        time.sleep(2)
        return assert_fn(token)
    finally:
        stop(server)


def assert_s1(token):
    _, ev = http("GET", "/api/events?status=ACTIVE", token)
    ok = ev["total"] == 0
    return ok, f"S1 active events={ev['total']}（期望 0）"


def assert_s2(token):
    _, ev = http("GET", "/api/events", token)
    if ev["total"] != 1:
        return False, f"S2 events={ev['total']}（期望 1）"
    e = ev["items"][0]
    if e["scopeReachIds"] != ["reach-a", "reach-b"]:
        return False, f"S2 scope={e['scopeReachIds']}"
    _, d = http("GET", f"/api/events/{e['eventId']}", token)
    rels = d["temporalRelations"]
    if [r["deltaSeconds"] for r in rels] != [540.0]:
        return False, f"S2 relations={rels}"
    return True, f"S2 {e['eventId']} scope=A/B rel=540s"


def assert_s3(token):
    _, ev = http("GET", "/api/events", token)
    if ev["total"] != 1:
        return False, f"S3 events={ev['total']}"
    e = ev["items"][0]
    if e["scopeReachIds"] != ["reach-a", "reach-b", "reach-c"]:
        return False, f"S3 scope={e['scopeReachIds']}"
    return True, f"S3 {e['eventId']} scope=A/B/C v{e['version']}"


def assert_s4(token):
    _, ev = http("GET", "/api/events", token)
    e = ev["items"][0]
    if "reach-c" in e["scopeReachIds"]:
        return False, "S4 不应扩展到 C"
    _, review = http("GET", f"/api/events/{e['eventId']}/review", token)
    states = {h["state"] for h in review["hypotheses"]}
    if "NOT_SUPPORT" not in states:
        return False, f"S4 假设未降级: {states}"
    return True, "S4 范围止于 A/B，传播假设 NOT_SUPPORT"


def assert_s5(token):
    _, ev = http("GET", "/api/events", token)
    if ev["total"] != 1:
        return False, f"S5 events={ev['total']}"
    e = ev["items"][0]
    if e["status"] == "RECOVERED":
        return False, "S5 盲区期间事件不得 RECOVERED"
    _, bs = http("GET", "/api/blind-spots?active=true", token)
    if not any(b["reachId"] == "reach-c" for b in bs):
        return False, f"S5 未形成 C 盲区: {[b['reachId'] for b in bs]}"
    return True, f"S5 事件 {e['status']}，C 盲区已形成"


SCENARIOS = [
    ("S1", 10, assert_s1),
    ("S2", 8, assert_s2),
    ("S3", 8, assert_s3),
    ("S4", 10, assert_s4),
    ("S5", 10, assert_s5),
]


def main() -> int:
    if not broker_up():
        print("SKIP: Mosquitto 未在 127.0.0.1:1883 运行")
        return 0
    failures = []
    for scenario, speed, check in SCENARIOS:
        print(f"--- {scenario} ---")
        try:
            ok, msg = run_one(scenario, speed, check)
        except Exception as exc:  # noqa: BLE001
            ok, msg = False, f"异常: {exc}"
        print(("PASS " if ok else "FAIL ") + msg)
        if not ok:
            failures.append(scenario)
    print("=" * 40)
    if failures:
        print(f"E2E FAIL: {failures}")
        return 1
    print("E2E PASS: S1–S5 全部符合预期")
    return 0


if __name__ == "__main__":
    sys.exit(main())
