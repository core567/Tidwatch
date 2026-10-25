"""WebSocket 端到端：PC 创建任务后，已连接客户端实时收到 task.created 帧。"""
from __future__ import annotations

import json


def _read_until(ws, target: str, max_frames: int = 30):
    frames = []
    for _ in range(max_frames):
        raw = ws.receive_text()
        msg = json.loads(raw)
        if msg.get("messageType") == "ping":
            continue
        frames.append(msg)
        if msg.get("messageType") == target:
            return frames
    return frames


def test_ws_receives_task_created_on_dispatch(client, token, clean_event_tables):
    with client.websocket_connect(f"/api/ws?token={token}") as ws:
        ws.receive_text()  # 消费 hello 帧

        payload = {
            "reachId": "reach-c",
            "title": "WS 联动核查任务",
            "priority": "HIGH",
            "reason": "WebSocket 端到端测试",
        }
        r = client.post(
            "/api/inspection-tasks",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        assert r.status_code == 200, r.text
        task_id = r.json()["taskId"]

        frames = _read_until(ws, "task.created")
        assert any(f["messageType"] == "task.created" for f in frames)
        task_frame = next(f for f in frames if f["messageType"] == "task.created")
        assert task_frame["payload"]["taskId"] == task_id


def test_ws_open_even_with_bad_token(client):
    # 演示模式：坏 token 也允许建立连接
    with client.websocket_connect("/api/ws?token=garbage") as ws:
        first = ws.receive_text()
        assert json.loads(first)["messageType"] == "ping"
