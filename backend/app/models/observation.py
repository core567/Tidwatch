"""原始观测、官方月报、导入批次、附件。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Observation(Base):
    """单断面单指标一次观测。observed_at 与 ingested_at 分开；重复靠 dedup_key 幂等。"""

    __tablename__ = "observations"
    __table_args__ = (
        UniqueConstraint("reach_id", "metric", "dedup_key", name="uq_observation_dedup"),
        Index("ix_obs_reach_metric_time", "reach_id", "metric", "observed_at"),
    )

    observation_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    reach_id: Mapped[str] = mapped_column(String(32), index=True)
    metric: Mapped[str] = mapped_column(String(48), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16))

    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    source_type: Mapped[str] = mapped_column(String(24))
    source_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    scenario_id: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    quality_flag: Mapped[str] = mapped_column(String(16), default="GOOD")
    rule_version: Mapped[str] = mapped_column(String(32), default="demo-rules-v1")

    message_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dedup_key: Mapped[str] = mapped_column(String(80))


class ImportBatch(Base, TimestampMixin):
    __tablename__ = "import_batches"

    batch_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    source_kind: Mapped[str] = mapped_column(String(32), default="OFFICIAL_MONTHLY")
    original_filename: Mapped[str] = mapped_column(String(256))
    agency: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    published_period: Mapped[str | None] = mapped_column(String(16), nullable=True)  # 2026-07
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="PREVIEW")  # PREVIEW/CONFIRMED/REVOKED
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    validation_report: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    imported_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


class OfficialMonthlyRecord(Base):
    """官方月度水质类别：独立于 observations，保留原始口径，禁止插值为连续曲线。"""

    __tablename__ = "official_monthly_records"
    __table_args__ = (
        UniqueConstraint(
            "batch_id", "river_name", "section_name", "period",
            name="uq_monthly_record",
        ),
    )

    record_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("import_batches.batch_id"), index=True)
    period: Mapped[str] = mapped_column(String(16), index=True)  # 2026-07
    river_name: Mapped[str] = mapped_column(String(64))
    section_name: Mapped[str] = mapped_column(String(64))
    function_class: Mapped[str | None] = mapped_column(String(8), nullable=True)
    current_class: Mapped[str | None] = mapped_column(String(8), nullable=True)
    compliance: Mapped[str | None] = mapped_column(String(16), nullable=True)
    yoy_change: Mapped[str | None] = mapped_column(String(16), nullable=True)
    overproof_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_row_json: Mapped[str] = mapped_column(Text)
    matched_reach_id: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Attachment(Base, TimestampMixin):
    __tablename__ = "attachments"

    attachment_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    filename: Mapped[str] = mapped_column(String(256))
    stored_path: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    related_type: Mapped[str | None] = mapped_column(String(32), nullable=True)  # task_result
    related_id: Mapped[str | None] = mapped_column(String(48), nullable=True)


class OfficialAutoRecord(Base):
    """官方自动监测站实时水质快照（实测常态为每日 00:00 一条）。

    与 observations（MQTT 模拟连续序列）物理隔离：官方数据不驱动事件机，
    也不插值成趋势曲线；缺失指标保留 NULL，前端显示"暂无数据"。
    """

    __tablename__ = "official_auto_records"
    __table_args__ = (
        UniqueConstraint("station_name", "observed_at", name="uq_official_auto_station_time"),
        Index("ix_official_auto_station_time", "station_name", "observed_at"),
    )

    record_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    station_name: Mapped[str] = mapped_column(String(64), index=True)
    province: Mapped[str | None] = mapped_column(String(32), nullable=True)
    basin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    water_class: Mapped[str | None] = mapped_column(String(8), nullable=True)  # Ⅰ–Ⅴ / 劣Ⅴ
    water_temp: Mapped[float | None] = mapped_column(Float, nullable=True)  # ℃
    ph: Mapped[float | None] = mapped_column(Float, nullable=True)
    dissolved_oxygen: Mapped[float | None] = mapped_column(Float, nullable=True)  # mg/L
    conductivity: Mapped[float | None] = mapped_column(Float, nullable=True)  # μS/cm
    turbidity: Mapped[float | None] = mapped_column(Float, nullable=True)  # NTU
    cod_mn: Mapped[float | None] = mapped_column(Float, nullable=True)  # 高锰酸盐指数 mg/L
    ammonia_n: Mapped[float | None] = mapped_column(Float, nullable=True)  # 氨氮 mg/L
    total_phosphorus: Mapped[float | None] = mapped_column(Float, nullable=True)  # 总磷 mg/L
    total_nitrogen: Mapped[float | None] = mapped_column(Float, nullable=True)  # 总氮 mg/L
    chlorophyll_a: Mapped[float | None] = mapped_column(Float, nullable=True)  # μg/L
    algae_density: Mapped[float | None] = mapped_column(Float, nullable=True)  # cells/L

    reach_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    mapping_status: Mapped[str] = mapped_column(String(16), default="UNVERIFIED")
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    raw_row_json: Mapped[str] = mapped_column(Text)


class OfficialAutoFetch(Base):
    """官方实时采集尝试日志（成功/失败），供 P12 展示最近拉取状态。"""

    __tablename__ = "official_auto_fetches"

    fetch_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ok: Mapped[bool] = mapped_column(default=False)
    station_count: Mapped[int] = mapped_column(Integer, default=0)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(String(512), nullable=True)
