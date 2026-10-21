"""SSE（PC Web）与 WebSocket（小程序）实时通道，共享 StreamHub。

鉴权：EventSource 无法自定义请求头，统一支持 ?token=<JWT>。
补漏：?resumeFrom=<messageId> 补放历史；EventSource 重连也读 Last-Event-ID。
心跳：SSE 15s 注释行；WS 25s ping 消息。
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.api.deps import user_from_token
from app.db.session import get_db
from app.realtime.hub import hub

router = APIRouter(tags=["realtime"])

SSE_KEEPALIVE_SEC = 15
WS_HEARTBEAT_SEC = 25


def _hello_frame(username: str) -> str:
    msg = hub.build_message(
        "ping",
        {"hello": True, "user": username, "serverTime": datetime.now(timezone.utc).isoformat()},
    )
    return json.dumps(msg.model_dump(by_alias=True, mode="json"), ensure_ascii=False)


# ---------------- SSE ----------------

@router.get("/api/stream")
async def sse_stream(
    request: Request,
    token: str | None = None,
    resume_from: str | None = None,
    db: Session = Depends(get_db),
):
    from fastapi.responses import StreamingResponse

    user = user_from_token(token, db)
    resume_from = resume_from or request.headers.get("last-event-id")
    queue = await hub.connect()

    async def event_generator():
        try:
            for frame in hub.replay_since(resume_from):
                yield f"id:{json.loads(frame)['messageId']}\ndata: {frame}\n\n"
            yield f"data: {_hello_frame(user.username)}\n\n"
            while True:
                try:
                    frame = await asyncio.wait_for(queue.get(), timeout=SSE_KEEPALIVE_SEC)
                    yield f"id:{json.loads(frame)['messageId']}\ndata: {frame}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            hub.disconnect(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------- WebSocket ----------------

@router.websocket("/api/ws")
async def ws_endpoint(
    websocket: WebSocket,
    token: str | None = None,
    resume_from: str | None = None,
) -> None:
    # 鉴权使用独立短会话
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        user = user_from_token(token, db)
    except Exception:
        db.close()
        # 先 accept 再以 1008（policy violation）关闭，保证客户端能收到关闭码
        await websocket.accept()
        await websocket.close(code=1008)
        return
    db.close()

    await websocket.accept()
    queue = await hub.connect()

    async def send_frames() -> None:
        # 补放 + hello
        for frame in hub.replay_since(resume_from):
            await websocket.send_text(frame)
        await websocket.send_text(_hello_frame(user.username))
        while True:
            try:
                frame = await asyncio.wait_for(queue.get(), timeout=WS_HEARTBEAT_SEC)
                await websocket.send_text(frame)
            except TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))

    async def receive_frames() -> None:
        try:
            while True:
                await websocket.receive_text()  # 客户端心跳/任意帧保活
        except WebSocketDisconnect:
            raise

    sender = asyncio.create_task(send_frames())
    try:
        await receive_frames()
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        hub.disconnect(queue)
