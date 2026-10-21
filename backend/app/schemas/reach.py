"""监测点契约。"""
from __future__ import annotations

from datetime import datetime

from app.schemas.base import CamelModel


class ReachOut(CamelModel):
    reach_id: str
    name: str
    role: str  # upstream / midstream / downstream
    topo_order: int
    online_status: str  # ONLINE / STALE / OFFLINE
    last_seen_at: datetime | None = None
    coordinate_status: str  # LOGICAL / VERIFIED
    longitude: float | None = None
    latitude: float | None = None
    coordinate_source: str | None = None
    official_candidate_name: str | None = None
