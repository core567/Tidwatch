"""M2 端到端回归：经真实 Mosquitto + FastAPI(含 MQTT ingestor) 验证场景。

前置：Mosquitto 在 127.0.0.1:1883。本脚本：
1) 启动 MQTT_ENABLED 的 uvicorn（独立端口、临时库）；
2) 用真实 publisher 播放 S1，断言零事件；
3) 重置，播放 S2，断言单事件 A/B + 时序关系 + Focus C。
用于人工/M4 CI 复核，不进 pytest（依赖外部 broker 与端口）。
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
PORT = 8040
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


def main() -> int:
    if not broker_up():
        print("SKIP: Mosquitto 未在 127.0.0.1:1883 运行")
        return 0

    tmp = Path(tempfile.mkdtemp(prefix="tw_e2e_")) / "e2e.db"

    def make_env(client_id: str):
        return os.environ | {
            "DATABASE_URL": f"sqlite:///{tmp.as_posix()}",
            "MQTT_ENABLED": "true",
            "MQTT_CLIENT_ID": client_id,
        }

    def start_server(client_id: str):
        return subprocess.Popen(
            [str(PY), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
            cwd=BACKEND, env=make_env(client_id),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )

    env = make_env("tw-e2e-s1")
    server: subprocess.Popen | None = None
    failures: list[str] = []
    try:
        # 先在临时库建表 + 种子，再启动服务（避免看门狗查空库）
        subprocess.run([str(PY), "scripts/init_db.py"], cwd=BACKEND, env=env, check=True, capture_output=True)
        subprocess.run([str(PY), "scripts/seed_data.py"], cwd=BACKEND, env=env, check=True, capture_output=True)

        server = start_server("tw-e2e-s1")
        wait_health()
        token = login()

        # ---- S1：零事件 ----
        run_scenario("S1", 10)
        time.sleep(1)
        _, ev1 = http("GET", "/api/events?status=ACTIVE", token)
        print(f"S1 active events: {ev1['total']}")
        if ev1["total"] != 0:
            failures.append(f"S1 应零事件，实际 {ev1['total']}")

        # ---- S2：重置隔离后用新 client_id 重启，单事件 A/B ----
        server.terminate(); server.wait(timeout=10); server = None
        subprocess.run([str(PY), "scripts/reset_db.py", "--yes"], cwd=BACKEND, env=env, check=True, capture_output=True)
        time.sleep(1)
        server = start_server("tw-e2e-s2")
        wait_health()
        time.sleep(1)
        token = login()
        # 等待 MQTT 订阅稳定（避免同 client_id 重连窗口丢消息）
        time.sleep(2)
        run_scenario("S2", 8)
        time.sleep(2)
        _, ev2 = http("GET", "/api/events", token)
        print(f"S2 events: {ev2['total']}")
        # 诊断：消息是否完整接收
        _, diag = http("GET", "/api/admin/diagnostics", token)
        print(f"S2 processed messages: {diag['counts']['processedMessages']}, errors: {diag['counts']['ingestionErrors']}")
        if ev2["total"] != 1:
            failures.append(f"S2 应单事件，实际 {ev2['total']}")
        else:
            e = ev2["items"][0]
            if e["scopeReachIds"] != ["reach-a", "reach-b"]:
                failures.append(f"S2 范围错误: {e['scopeReachIds']}")
            _, detail = http("GET", f"/api/events/{e['eventId']}", token)
            rels = detail["temporalRelations"]
            if len(rels) != 1 or rels[0]["deltaSeconds"] != 540:
                failures.append(f"S2 时序关系错误: {rels}")
            print(f"S2 {e['eventId']} scope={e['scopeReachIds']} v{e['version']} relations={[r['deltaSeconds'] for r in rels]}")

    except Exception as exc:  # noqa: BLE001
        failures.append(f"异常: {exc}")
        if server.poll() is None:
            print(server.stdout.read()[-2000:])
    finally:
        # Windows 下 terminate() 可能留下持有 MQTT 连接的子进程，用 taskkill 杀进程树
        if server is not None and server.poll() is None:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(server.pid)],
                capture_output=True,
            )
        # 兜底：清理本脚本端口上的监听进程
        subprocess.run(
            'for /f "tokens=5" %a in (\'netstat -ano ^| findstr ":8040.*LISTENING"\') do taskkill /F /PID %a',
            shell=True, capture_output=True,
        )
        time.sleep(1)

    if failures:
        print("FAIL:")
        for f in failures:
            print(" -", f)
        return 1
    print("E2E PASS: S1 零事件，S2 单事件 A/B + 540s 时序关系")
    return 0


if __name__ == "__main__":
    sys.exit(main())
