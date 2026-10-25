"""官方自动监测实时水质只读接口（P01/P02/3D/P12）。

官方实时数据与 MQTT 模拟观测物理隔离：本路由只读 official_auto_records，
不写入 observations，也不触发事件机。
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.routes_import import require_admin
from app.core.config import settings
from app.db.session import get_db
from app.ingestion import official_auto
from app.models.system import User
from app.schemas.official_auto import (
    OfficialAutoFetchOut,
    OfficialAutoLatestOut,
    OfficialAutoRecordOut,
    OfficialAutoSyncOut,
)

router = APIRouter(prefix="/api/official", tags=["official-auto"])


def _to_out(record, now: datetime) -> OfficialAutoRecordOut:
    return OfficialAutoRecordOut(
        station_name=record.station_name,
        reach_id=record.reach_id,
        mapping_status=record.mapping_status,
        province=record.province,
        basin=record.basin,
        observed_at=official_auto.to_utc(record.observed_at),
        fetched_at=official_auto.to_utc(record.fetched_at),
        water_class=record.water_class,
        water_temp=record.water_temp,
        ph=record.ph,
        dissolved_oxygen=record.dissolved_oxygen,
        conductivity=record.conductivity,
        turbidity=record.turbidity,
        cod_mn=record.cod_mn,
        ammonia_n=record.ammonia_n,
        total_phosphorus=record.total_phosphorus,
        total_nitrogen=record.total_nitrogen,
        chlorophyll_a=record.chlorophyll_a,
        algae_density=record.algae_density,
        data_state=official_auto.data_state(record, now),
        age_minutes=official_auto.age_minutes(record, now),
        source_label=official_auto.SOURCE_LABEL,
        source_url=record.source_url,
    )


@router.get("/auto", response_model=list[OfficialAutoLatestOut])
def latest_auto(
    reachId: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[OfficialAutoLatestOut]:
    """按断面返回官方最新值；无记录也返回 NO_DATA 项，便于前端显示"暂无数据"。"""
    now = datetime.now(timezone.utc)
    bindings = [b for b in official_auto.STATIONS if not reachId or b.reach_id == reachId]
    rows = official_auto.latest_records(db, reach_id=reachId)
    by_reach: dict[str, list] = {}
    for row in rows:
        if row.reach_id:
            by_reach.setdefault(row.reach_id, []).append(row)

    out: list[OfficialAutoLatestOut] = []
    for b in bindings:
        recs = by_reach.get(b.reach_id, [])
        latest = max(recs, key=lambda r: r.observed_at) if recs else None
        out.append(
            OfficialAutoLatestOut(
                reach_id=b.reach_id,
                station_name=b.station_name,
                mapping_note=b.note,
                data_state=official_auto.data_state(latest, now),
                records=[_to_out(r, now) for r in recs],
            )
        )
    return out


@router.get("/auto/status")
def auto_status(db: Session = Depends(get_db)) -> dict:
    last = official_auto.latest_fetch(db)
    return {
        "enabled": settings.official_auto_enabled,
        "cacheMinutes": settings.official_auto_cache_minutes,
        "staleMinutes": settings.official_auto_stale_minutes,
        "sourceLabel": official_auto.SOURCE_LABEL,
        "sourceUrl": settings.official_auto_url,
        "stations": [
            {"stationName": b.station_name, "reachId": b.reach_id, "note": b.note}
            for b in official_auto.STATIONS
        ],
        "lastFetch": (
            OfficialAutoFetchOut(
                fetch_id=last.fetch_id,
                fetched_at=official_auto.to_utc(last.fetched_at),
                ok=last.ok,
                station_count=last.station_count,
                record_count=last.record_count,
                duration_ms=last.duration_ms,
                message=last.message,
            ).model_dump(by_alias=True)
            if last
            else None
        ),
    }


@router.post("/auto/refresh", response_model=OfficialAutoSyncOut)
def refresh_auto(
    force: bool = Query(default=False, description="忽略缓存与开关，立即拉取"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_admin),
) -> OfficialAutoSyncOut:
    """手动拉取官方实时值。默认遵守 30 分钟缓存；force=true 强制刷新。"""
    result = official_auto.sync(db, force=force)
    return OfficialAutoSyncOut(**result)
