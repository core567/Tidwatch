"""Pydantic 契约测试：camelCase、严格校验、消息信封。"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.auth import LoginRequest
from app.schemas.event import EventActionRequest
from app.schemas.observation import InboundMessage
from app.schemas.stream import StreamMessage


def test_camel_case_in_and_snake_case_construct():
    # 前端/设备使用 camelCase
    msg = InboundMessage.model_validate(
        {
            "messageId": "m-1",
            "reachId": "reach-a",
            "observedAt": "2026-10-21T12:00:00+08:00",
            "scenarioId": "S2",
            "metrics": {
                "waterLevel": {"value": 4.5, "unit": "m"},
                "turbidity": {"value": 20, "unit": "NTU"},
            },
        }
    )
    assert msg.message_id == "m-1"
    assert msg.metrics["waterLevel"].value == 4.5
    assert msg.source_type == "SIMULATED"  # 默认值
    # 输出必须是 camelCase（GRP 8 联调验收）
    dumped = msg.model_dump(by_alias=True)
    assert "messageId" in dumped and "reachId" in dumped and "observedAt" in dumped


def test_extra_field_forbidden():
    with pytest.raises(ValidationError):
        LoginRequest(username="a", password="b", unexpected=True)  # type: ignore[arg-type]


def test_empty_metrics_rejected():
    with pytest.raises(ValidationError):
        InboundMessage.model_validate(
            {
                "messageId": "m-2",
                "reachId": "reach-b",
                "observedAt": "2026-10-21T12:00:00+08:00",
                "metrics": {},
            }
        )


def test_confidence_range_and_bad_datetime():
    with pytest.raises(ValidationError):
        InboundMessage.model_validate(
            {
                "messageId": "m-3",
                "reachId": "reach-c",
                "observedAt": "not-a-time",
                "metrics": {"flowLevel": {"value": 1, "unit": "enum0-3"}},
            }
        )
    with pytest.raises(ValidationError):
        InboundMessage.model_validate(
            {
                "messageId": "m-4",
                "reachId": "reach-c",
                "observedAt": "2026-10-21T12:00:00+08:00",
                "metrics": {
                    "flowLevel": {"value": 1, "unit": "enum0-3", "confidence": 1.5}
                },
            }
        )


def test_event_action_must_be_known():
    req = EventActionRequest.model_validate({"action": "ESCALATE", "reason": "连续超阈值"})
    assert req.action == "ESCALATE"
    with pytest.raises(ValidationError):
        EventActionRequest.model_validate({"action": "JUMP_TO_RECOVERED"})


def test_stream_envelope_roundtrip():
    m = StreamMessage.model_validate(
        {
            "messageId": "msg-1",
            "messageType": "event.created",
            "scenarioId": "S2",
            "sentAt": "2026-10-21T12:08:00+08:00",
            "payload": {"eventId": "TW-E01"},
        }
    )
    out = m.model_dump(by_alias=True)
    assert out["messageType"] == "event.created"
    assert out["payload"]["eventId"] == "TW-E01"
