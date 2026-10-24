"""paho MQTT 订阅客户端 + 断面新鲜度看门狗。

- 仅后端订阅，前端不直连 broker；
- 每条消息使用独立 DB 会话，异常不拖垮循环；
- 断连自动重连（connect_async + loop_start）；
- 看门狗：超时未收到数据的 ONLINE 断面置 STALE（离线由 LWT 置 OFFLINE）。
"""
from __future__ import annotations

import asyncio
import json
from datetime import timedelta

import paho.mqtt.client as mqtt
from sqlalchemy import select

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.ingestion.observation_service import (
    _aware,
    mark_reach_status,
    process_observation_payload,
    utc_now,
)
from app.models.reach import Reach
from app.realtime.hub import hub
from app.services.event_service import processor

logger = get_logger("mqtt")


def _notify(message_type: str, payload: dict, scenario_id: str | None) -> None:
    hub.publish_threadsafe(message_type, payload, scenario_id)


class MqttIngestor:
    def __init__(self) -> None:
        self.client: mqtt.Client | None = None
        self.topic_observation = f"{settings.mqtt_topic_prefix}/+/observation"
        self.topic_heartbeat = f"{settings.mqtt_topic_prefix}/+/heartbeat"
        self.topic_status = f"{settings.mqtt_topic_prefix}/+/status"

    # ---------- 生命周期 ----------

    def start(self) -> None:
        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=settings.mqtt_client_id,
            clean_session=True,
        )
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        client.on_disconnect = self._on_disconnect
        # 遗嘱由发布端（simulator/MQTTX）设置；后端作为订阅端无需 LWT
        client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=30)
        client.loop_start()
        self.client = client
        logger.info(
            "mqtt ingestor starting: %s:%s prefix=%s",
            settings.mqtt_host,
            settings.mqtt_port,
            settings.mqtt_topic_prefix,
        )

    def stop(self) -> None:
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None
            logger.info("mqtt ingestor stopped")

    # ---------- 回调 ----------

    def _on_connect(self, client, _userdata, _flags, reason_code, *_args) -> None:
        # paho v2 回调里 reason_code 是 ReasonCode 对象，取其数值
        rc = getattr(reason_code, "value", reason_code)
        if rc == 0:
            for t in (self.topic_observation, self.topic_heartbeat, self.topic_status):
                client.subscribe(t, qos=1)
            logger.info(
                "mqtt connected, subscribed: %s, %s, %s",
                self.topic_observation,
                self.topic_heartbeat,
                self.topic_status,
            )
        else:
            logger.error("mqtt connect failed: %s", reason_code)

    def _on_disconnect(self, _client, _userdata, *args) -> None:
        logger.warning("mqtt disconnected, paho will auto-reconnect")

    def _on_message(self, _client, _userdata, msg) -> None:
        topic = msg.topic
        try:
            text = msg.payload.decode("utf-8")
        except UnicodeDecodeError:
            logger.warning("non-utf8 payload on %s, dropped", topic)
            return

        db = SessionLocal()
        try:
            if topic.endswith("/observation"):
                outcome = process_observation_payload(
                    db,
                    text,
                    topic,
                    notifier=_notify,
                on_processed=lambda msg, obs_ids: self._run_event_processor(
                    db, msg.reach_id, msg.observed_at, msg.scenario_id, obs_ids
                ),
                )
                # 处理钩子已在 service 内提交；outcome 仅用于日志
                if not outcome.accepted:
                    logger.warning("message rejected: %s", outcome.reason)
            elif topic.endswith("/heartbeat"):
                self._handle_heartbeat(db, topic)
            elif topic.endswith("/status"):
                self._handle_status(db, text, topic)
        except Exception:  # noqa: BLE001
            logger.exception("failed handling message on %s", topic)
        finally:
            db.close()

    # ---------- heartbeat / LWT status ----------

    def _run_event_processor(self, db, reach_id, observed_at, scenario_id, obs_ids) -> None:
        """从刚入库的最新水位/浊度取值，驱动变化检测→事件。"""
        from app.models.observation import Observation

        def latest(metric: str):
            return db.execute(
                select(Observation.value)
                .where(
                    Observation.reach_id == reach_id,
                    Observation.metric == metric,
                )
                .order_by(Observation.observed_at.desc(), Observation.ingested_at.desc())
                .limit(1)
            ).scalar_one_or_none()

        water_level = latest("waterLevel")
        turbidity = latest("turbidity")
        processor.process_sample(
            db,
            reach_id,
            observed_at,
            water_level,
            turbidity,
            scenario_id,
            obs_ids,
            notifier=_notify,
        )

    def _reach_from_topic(self, topic: str) -> str | None:
        parts = topic.strip("/").split("/")
        return parts[2] if len(parts) >= 4 else None

    def _handle_heartbeat(self, db, topic: str) -> None:
        reach_id = self._reach_from_topic(topic)
        if reach_id:
            mark_reach_status(db, reach_id, "ONLINE", notifier=_notify)

    def _handle_status(self, db, text: str, topic: str) -> None:
        reach_id = self._reach_from_topic(topic)
        if not reach_id:
            return
        try:
            body = json.loads(text)
            status = str(body.get("status", "")).upper()
        except (json.JSONDecodeError, AttributeError):
            return
        if status in {"ONLINE", "OFFLINE", "STALE"}:
            changed = mark_reach_status(db, reach_id, status, notifier=_notify)
            if changed:
                logger.info("reach %s -> %s (LWT/status)", reach_id, status)
            self._handle_blind_spot(db, reach_id, status)

    def _handle_blind_spot(self, db, reach_id: str, status: str) -> None:
        """关键观察点离线/陈旧形成盲区；恢复在线则关闭盲区。"""
        import json as _json

        from app.models.event import ActiveEvent, EventScope
        from app.models.focus import ObservationFocus
        from app.services import blindspot_service

        # 该断面是否为某活动事件的关注重点或在其范围内
        event_id: str | None = None
        focus = db.execute(
            select(ObservationFocus).where(
                ObservationFocus.reach_id == reach_id,
                ObservationFocus.status == "ACTIVE",
            )
        ).scalars().first()
        if focus is not None:
            event_id = focus.event_id
        else:
            for event in db.query(ActiveEvent).filter(
                ActiveEvent.status.in_(
                    ("OPEN", "INVESTIGATING", "MONITORING", "ESCALATED",
                     "NARROWED", "RECOVERY_PENDING")
                )
            ):
                latest = db.execute(
                    select(EventScope.reaches_json)
                    .where(EventScope.event_id == event.event_id)
                    .order_by(EventScope.version.desc())
                    .limit(1)
                ).scalar_one_or_none()
                if reach_id in _json.loads(latest or "[]"):
                    event_id = event.event_id
                    break

        if status in {"OFFLINE", "STALE"}:
            if event_id is not None or focus is not None:
                reason = "数据链路中断（LWT 离线）" if status == "OFFLINE" else "数据陈旧超时"
                bs = blindspot_service.open_blind_spot(db, reach_id, reason, event_id=event_id)
                db.commit()
                if bs is not None:
                    _notify(
                        "blindspot.opened",
                        {"reachId": reach_id, "eventId": event_id, "reason": reason},
                        None,
                    )
        elif status == "ONLINE":
            bs = blindspot_service.resolve_blind_spot(db, reach_id, "数据链路恢复")
            if bs is not None:
                db.commit()
                _notify("blindspot.resolved", {"reachId": reach_id}, None)


async def freshness_watchdog(stop_event: asyncio.Event) -> None:
    """周期性检查数据新鲜度：超时断面 ONLINE→STALE。"""
    stale_after = timedelta(seconds=settings.mqtt_stale_seconds)
    while not stop_event.is_set():
        try:
            db = SessionLocal()
            try:
                now = utc_now()
                for reach in db.query(Reach).filter(Reach.online_status == "ONLINE").all():
                    # 看门狗基于链路接收时刻（墙钟），迟到观测不触发误判
                    ref = reach.last_received_at or reach.last_seen_at
                    if ref is not None and now - _aware(ref) > stale_after:
                        mark_reach_status(db, reach.reach_id, "STALE", notifier=_notify)
                        logger.info("reach %s -> STALE (no data > %ds)", reach.reach_id, settings.mqtt_stale_seconds)
            finally:
                db.close()
        except Exception:  # noqa: BLE001
            logger.exception("watchdog tick failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=10)
        except asyncio.TimeoutError:
            pass
