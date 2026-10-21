"""SSE / WebSocket 实时通道测试：鉴权、hello、广播与补放。"""
from __future__ import annotations

import json

import pytest
from starlette.websockets import WebSocketDisconnect

from app.realtime.hub import hub


def test_ws_unauthorized_closed(client):
    # 无 token / 坏 token：服务端握手后以 1008（policy violation）关闭
    with client.websocket_connect("/api/ws?token=garbage") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
        assert exc.value.code == 1008


def test_ws_hello_and_broadcast(client, token):
    with client.websocket_connect(f"/api/ws?token={token}") as ws:
        first = json.loads(ws.receive_text())
        assert first["messageType"] == "ping"
        assert first["payload"]["hello"] is True

        # lifespan 已把 Hub 绑定到服务端事件循环，线程安全广播
        hub.publish_threadsafe("event.created", {"eventId": "TW-E99"}, "S2")
        msg = json.loads(ws.receive_text())
        assert msg["messageType"] == "event.created"
        assert msg["payload"]["eventId"] == "TW-E99"
        assert msg["scenarioId"] == "S2"
        assert msg["messageId"]


def test_sse_requires_token(client):
    with client.stream("GET", "/api/stream") as resp:
        # 未授权：AppError 经异常处理返回 401（SSE 建连前的普通响应）
        assert resp.status_code == 401


def test_sse_hello_frame(client, token):
    with client.stream("GET", f"/api/stream?token={token}") as resp:
        assert resp.status_code == 200
        first_chunk = next(resp.iter_text())
        assert "data:" in first_chunk
        assert "hello" in first_chunk


def test_replay_since_helper():
    m1 = hub.build_message("event.updated", {"n": 1})
    m2 = hub.build_message("event.updated", {"n": 2})
    hub._broadcast(m1)
    hub._broadcast(m2)
    frames = hub.replay_since(m1.message_id)
    assert len(frames) == 1
    assert json.loads(frames[0])["payload"]["n"] == 2
    assert hub.replay_since("nonexistent-id") == []
