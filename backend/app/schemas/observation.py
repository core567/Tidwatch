"""观测与 MQTT 入站消息契约。

入站为一个断面一次采样的多指标快照（对齐 C02 发送习惯），
入库时由 ingestion 层拆分为多条 GRP 单指标 Observation。
status 不允许发送端填写，由后端规则统一计算。
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import CamelModel

QualityFlag = Literal["GOOD", "SUSPECT", "INVALID", "MISSING", "STALE"]
SourceType = Literal[
    "OFFICIAL_PUBLIC",
    "SIMULATED",
    "EXTERNAL",
    "RULE_OUTPUT",
    "MODEL_OUTPUT",
    "MANUAL",
]


class MetricValue(CamelModel):
    value: float
    unit: str
    quality_flag: QualityFlag = "GOOD"
    # flowLevel 等感知结论的来源；模拟/规则不得伪造模型置信度
    perception_source: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class InboundMessage(CamelModel):
    """MQTT topic tidewatch/v1/{reachId}/observation 消息体。"""

    message_id: str = Field(min_length=1, max_length=64)
    reach_id: str = Field(min_length=3, max_length=32)
    observed_at: datetime
    scenario_id: str | None = Field(default=None, max_length=16)
    source_type: SourceType = "SIMULATED"
    seq: int | None = Field(default=None, ge=0)
    metrics: dict[str, MetricValue]

    @field_validator("metrics")
    @classmethod
    def _not_empty(cls, v: dict[str, MetricValue]) -> dict[str, MetricValue]:
        if not v:
            raise ValueError("metrics 不能为空")
        return v


class ObservationOut(CamelModel):
    observation_id: str
    reach_id: str
    metric: str
    value: float
    unit: str
    observed_at: datetime
    ingested_at: datetime
    source_type: str
    source_name: str | None = None
    source_ref: str | None = None
    scenario_id: str | None = None
    quality_flag: str
    rule_version: str
