"""观测消息入库服务：校验、幂等去重、双时间戳、坏消息死信。

纯业务逻辑、不直接依赖 paho，便于单测；notifier 可注入（默认走实时 Hub）。
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.ingestion import IngestionError, ProcessedMessage
from app.models.observation import Observation
from app.models.reach import MetricDictionary, Reach
from app.schemas.observation import InboundMessage

logger = get_logger("ingestion")

Notifier = Callable[[str, dict, str | None], None]
ProcessedHook = Callable[["InboundMessage", list[str]], None]


@dataclass
class IngestOutcome:
    accepted: bool
    duplicate: bool = False
    observation_ids: list[str] | None = None
    reach_id: str | None = None
    reason: str | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    """SQLite 取回的时间可能缺 tzinfo，按 UTC 比较。"""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _reject(
    db: Session,
    reason: str,
    *,
    topic: str | None,
    raw: str | None,
    detail: str | None = None,
    source: str = "MQTT",
) -> IngestOutcome:
    db.add(
        IngestionError(
            source=source,
            topic=topic,
            raw_payload=(raw or "")[:8000],
            reason=reason,
            detail=detail,
        )
    )
    db.commit()
    logger.warning("message rejected: %s (%s)", reason, detail or "")
    return IngestOutcome(accepted=False, reason=reason)


def process_observation_payload(
    db: Session,
    raw_text: str,
    topic: str | None = None,
    *,
    notifier: Notifier | None = None,
    on_processed: ProcessedHook | None = None,
) -> IngestOutcome:
    """处理一条 observation 消息。任何异常都不得冒泡拖垮 MQTT 循环。"""
    # 1) JSON 解析
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        return _reject(db, "INVALID_JSON", topic=topic, raw=raw_text, detail=str(e))
    if not isinstance(data, dict):
        return _reject(db, "INVALID_JSON", topic=topic, raw=raw_text, detail="payload 不是对象")

    # 2) Pydantic 契约校验（缺字段/坏时间/空指标/越界置信度等）
    try:
        msg = InboundMessage.model_validate(data)
    except ValidationError as e:
        return _reject(
            db, "SCHEMA_VIOLATION", topic=topic, raw=raw_text, detail=e.json()
        )

    # 3) topic 与 payload 的 reachId 必须一致
    topic_reach = _reach_from_topic(topic) if topic else None
    if topic_reach and topic_reach != msg.reach_id:
        return _reject(
            db,
            "TOPIC_MISMATCH",
            topic=topic,
            raw=raw_text,
            detail=f"topic={topic_reach} payload={msg.reach_id}",
        )

    # 4) 断面必须存在
    reach = db.get(Reach, msg.reach_id)
    if reach is None:
        return _reject(db, "UNKNOWN_REACH", topic=topic, raw=raw_text, detail=msg.reach_id)

    # 5) 消息幂等：messageId 只生效一次
    existing = db.get(ProcessedMessage, msg.message_id)
    if existing is not None:
        existing.duplicate_count += 1
        existing.last_seen_at = utc_now()
        db.commit()
        logger.info("duplicate message ignored: %s (count=%d)", msg.message_id, existing.duplicate_count)
        return IngestOutcome(
            accepted=True, duplicate=True, observation_ids=[], reach_id=msg.reach_id
        )

    # 6) 指标字典：键存在、单位一致、量程合法
    metrics_meta = {m.metric_key: m for m in db.query(MetricDictionary).filter(
        MetricDictionary.enabled.is_(True)
    ).all()}
    metric_values: dict[str, dict] = {}
    for key, mv in msg.metrics.items():
        meta = metrics_meta.get(key)
        if meta is None:
            return _reject(db, "UNKNOWN_METRIC", topic=topic, raw=raw_text, detail=key)
        if mv.unit.strip() != meta.unit:
            return _reject(
                db,
                "UNIT_MISMATCH",
                topic=topic,
                raw=raw_text,
                detail=f"{key}: 收到 {mv.unit}，字典要求 {meta.unit}",
            )
        lo, hi = meta.min_value, meta.max_value
        if (lo is not None and mv.value < lo) or (hi is not None and mv.value > hi):
            return _reject(
                db,
                "OUT_OF_RANGE",
                topic=topic,
                raw=raw_text,
                detail=f"{key}={mv.value} 超出量程 [{lo}, {hi}]",
            )
        metric_values[key] = {
            "value": mv.value,
            "unit": mv.unit,
            "qualityFlag": mv.quality_flag,
            "perceptionSource": mv.perception_source,
            "confidence": mv.confidence,
        }

    # 7) 双时间戳：observedAt（可能乱序/迟到）与 ingestedAt（服务器接收）
    observed_at = msg.observed_at
    if observed_at.tzinfo is None:
        # 未带时区时按演示环境东八区处理
        from datetime import timedelta

        observed_at = observed_at.replace(tzinfo=timezone(timedelta(hours=8)))
    ingested_at = utc_now()

    # 8) 拆分为多条单指标 Observation（dedup_key 用 messageId，唯一约束兜底）
    observation_ids: list[str] = []
    for key, mv in msg.metrics.items():
        obs = Observation(
            observation_id=f"obs-{uuid.uuid4().hex[:20]}",
            reach_id=msg.reach_id,
            metric=key,
            value=mv.value,
            unit=mv.unit,
            observed_at=observed_at,
            ingested_at=ingested_at,
            source_type=msg.source_type,
            source_name=f"scenario-{msg.scenario_id}" if msg.scenario_id else "mqtt",
            scenario_id=msg.scenario_id,
            quality_flag=mv.quality_flag,
            rule_version="demo-rules-v1",
            message_id=msg.message_id,
            dedup_key=msg.message_id,
        )
        db.add(obs)
        observation_ids.append(obs.observation_id)

    db.add(
        ProcessedMessage(
            message_id=msg.message_id,
            reach_id=msg.reach_id,
            topic=topic,
            duplicate_count=0,
        )
    )

    # 9) 更新断面在线状态。
    # online_status 反映“链路是否存活”，用接收时刻（墙钟 UTC），
    # 这样迟到数据（旧 observedAt）不会被看门狗误判为陈旧；
    # last_seen_at 同时作为“最后有效观测时间”展示，取不回滚的最新观测时刻。
    received_at = utc_now()
    reach.online_status = "ONLINE"
    # 看门狗基于独立的链路时间列；这里 last_seen_at 保留业务最新观测（迟到不覆盖）
    if reach.last_seen_at is None or observed_at >= _aware(reach.last_seen_at):
        reach.last_seen_at = observed_at
    reach.last_received_at = received_at

    db.commit()

    # 10) 实时推送（一条入站消息一个帧，payload 为多指标快照）
    if notifier is not None:
        try:
            notifier(
                "observation.created",
                {
                    "reachId": msg.reach_id,
                    "observedAt": observed_at.isoformat(),
                    "ingestedAt": ingested_at.isoformat(),
                    "sourceType": msg.source_type,
                    "scenarioId": msg.scenario_id,
                    "metrics": metric_values,
                    "observationIds": observation_ids,
                },
                msg.scenario_id,
            )
        except Exception:  # noqa: BLE001
            logger.exception("notifier failed for message %s", msg.message_id)

    # 11) 后续处理钩子（如变化检测→事件），失败不回滚观测入库
    if on_processed is not None:
        try:
            on_processed(msg, observation_ids)
        except Exception:  # noqa: BLE001
            logger.exception("on_processed hook failed for %s", msg.message_id)

    return IngestOutcome(
        accepted=True, duplicate=False, observation_ids=observation_ids, reach_id=msg.reach_id
    )


def mark_reach_status(
    db: Session,
    reach_id: str,
    status: str,
    *,
    notifier: Notifier | None = None,
) -> bool:
    """LWT 状态消息处理：ONLINE/OFFLINE。返回状态是否发生变化。"""
    reach = db.get(Reach, reach_id)
    if reach is None:
        return False
    if reach.online_status == status:
        return False
    reach.online_status = status
    db.commit()
    if notifier is not None:
        notifier(
            "reach.status-changed",
            {"reachId": reach_id, "onlineStatus": status},
            None,
        )
    return True


def _reach_from_topic(topic: str) -> str | None:
    # tidewatch/v1/{reachId}/(observation|heartbeat|status)
    parts = topic.strip("/").split("/")
    if len(parts) >= 4 and parts[0] == "tidewatch" and parts[1] == "v1":
        return parts[2]
    return None
