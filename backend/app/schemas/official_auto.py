"""官方自动监测实时水质契约。"""
from __future__ import annotations

from datetime import datetime

from app.schemas.base import CamelModel


class OfficialAutoRecordOut(CamelModel):
    station_name: str
    reach_id: str | None = None
    mapping_status: str = "UNVERIFIED"
    province: str | None = None
    basin: str | None = None
    observed_at: datetime
    fetched_at: datetime
    water_class: str | None = None

    water_temp: float | None = None
    ph: float | None = None
    dissolved_oxygen: float | None = None
    conductivity: float | None = None
    turbidity: float | None = None
    cod_mn: float | None = None
    ammonia_n: float | None = None
    total_phosphorus: float | None = None
    total_nitrogen: float | None = None
    chlorophyll_a: float | None = None
    algae_density: float | None = None

    # LIVE（观测时间在阈值内）/ STALE（过期）/ NO_DATA 由站点粒度另行返回
    data_state: str = "LIVE"
    age_minutes: int | None = None
    source_label: str
    source_url: str | None = None


class OfficialAutoLatestOut(CamelModel):
    """按断面聚合的最新官方水质。"""

    reach_id: str | None = None
    records: list[OfficialAutoRecordOut]
    data_state: str  # LIVE / STALE / NO_DATA
    station_name: str | None = None
    mapping_note: str | None = None


class OfficialAutoFetchOut(CamelModel):
    fetch_id: str
    fetched_at: datetime
    ok: bool
    station_count: int
    record_count: int
    duration_ms: int | None = None
    message: str | None = None


class OfficialAutoSyncOut(CamelModel):
    ok: bool
    skipped: bool = False
    reason: str | None = None
    fetched_at: str | None = None
    next_allowed_at: str | None = None
    stations_ok: int = 0
    stations_total: int = 0
    records_inserted: int = 0
    records_skipped: int = 0
    errors: list[str] = []
