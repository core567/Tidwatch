"""统一实时推送 Hub：同一消息扇出给 PC SSE 与小程序 WS。

- 每个客户端一个 asyncio.Queue；
- 环形历史保留最近 N 条，重连带 resumeFrom 时补放错过的消息
  （客户端仍须重拉快照，补放只是双保险之一）；
- publish_threadsafe 供 paho MQTT 线程安全投递。
"""
from __future__ import annotations

import asyncio
import json
import uuid
from collections import deque
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.schemas.stream import StreamMessage

logger = get_logger("realtime-hub")

HISTORY_SIZE = 200


class StreamHub:
    def __init__(self) -> None:
        self._clients: set[asyncio.Queue[str | None]] = set()
        self._history: deque[dict] = deque(maxlen=HISTORY_SIZE)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    # ---------- 客户端管理 ----------

    async def connect(self) -> asyncio.Queue[str | None]:
        q: asyncio.Queue[str | None] = asyncio.Queue(maxsize=100)
        self._clients.add(q)
        logger.info("client connected, total=%d", len(self._clients))
        return q

    def disconnect(self, q: asyncio.Queue[str | None]) -> None:
        self._clients.discard(q)
        logger.info("client disconnected, total=%d", len(self._clients))

    def replay_since(self, resume_from: str | None) -> list[str]:
        """返回 resumeFrom 之后的历史消息（已序列化）。"""
        if not resume_from:
            return []
        ids = [m["messageId"] for m in self._history]
        if resume_from not in ids:
            # 历史已滑出或无效：返回空，由客户端靠快照补全
            return []
        idx = ids.index(resume_from)
        return [json.dumps(m, ensure_ascii=False) for m in list(self._history)[idx + 1:]]

    # ---------- 广播 ----------

    def build_message(
        self,
        message_type: str,
        payload: dict,
        scenario_id: str | None = None,
    ) -> StreamMessage:
        return StreamMessage(
            message_id=str(uuid.uuid4()),
            message_type=message_type,  # type: ignore[arg-type]
            scenario_id=scenario_id,
            sent_at=datetime.now(timezone.utc),
            payload=payload,
        )

    def publish_threadsafe(
        self,
        message_type: str,
        payload: dict,
        scenario_id: str | None = None,
    ) -> None:
        """供非 async 上下文（paho 回调线程）调用。"""
        msg = self.build_message(message_type, payload, scenario_id)
        if self._loop is None:
            logger.warning("event loop not bound, message %s dropped", message_type)
            return
        self._loop.call_soon_threadsafe(self._broadcast, msg)

    async def publish(
        self,
        message_type: str,
        payload: dict,
        scenario_id: str | None = None,
    ) -> None:
        self._broadcast(self.build_message(message_type, payload, scenario_id))

    def _broadcast(self, msg: StreamMessage) -> None:
        data = msg.model_dump(by_alias=True, mode="json")
        self._history.append(data)
        text = json.dumps(data, ensure_ascii=False)
        dead: list[asyncio.Queue[str | None]] = []
        for q in self._clients:
            try:
                q.put_nowait(text)
            except asyncio.QueueFull:
                # 慢客户端不拖累其他端：断开让其重连补放
                dead.append(q)
        for q in dead:
            self.disconnect(q)


hub = StreamHub()
