"""监测点与指标字典。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Reach(Base, TimestampMixin):
    __tablename__ = "reaches"

    reach_id: Mapped[str] = mapped_column(String(32), primary_key=True)  # reach-a/b/c
    name: Mapped[str] = mapped_column(String(64))  # 上游 A
    role: Mapped[str] = mapped_column(String(16))  # upstream/midstream/downstream
    topo_order: Mapped[int] = mapped_column(Integer)
    online_status: Mapped[str] = mapped_column(String(16), default="OFFLINE")
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 链路最后接收时刻（墙钟，看门狗用；区别于业务观测时间 last_seen_at）
    last_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # 坐标/拓扑核验状态：未核实前一律 LOGICAL + 示意拓扑
    coordinate_status: Mapped[str] = mapped_column(String(16), default="LOGICAL")
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    coordinate_source: Mapped[str | None] = mapped_column(String(256), nullable=True)
    official_candidate_name: Mapped[str | None] = mapped_column(String(64), nullable=True)

    metadata_json: Mapped[str | None] = mapped_column("metadata", String, nullable=True)


class MetricDictionary(Base, TimestampMixin):
    __tablename__ = "metric_dictionary"

    metric_key: Mapped[str] = mapped_column(String(48), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(64))
    unit: Mapped[str] = mapped_column(String(16))
    min_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    data_kind: Mapped[str] = mapped_column(String(32), default="continuous")
    enabled: Mapped[bool] = mapped_column(default=True)
