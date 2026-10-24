"""盲区契约与查询路由。"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.focus import BlindSpot
from app.models.system import User
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api", tags=["blindspots"])


class BlindSpotOut(CamelModel):
    blind_spot_id: str
    event_id: str | None = None
    reach_id: str
    start_at: datetime
    end_at: datetime | None = None
    reason: str
    impact: str | None = None
    resolution: str | None = None


@router.get("/blind-spots", response_model=list[BlindSpotOut])
def list_blind_spots(
    active: bool = Query(default=False),
    reachId: str | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[BlindSpotOut]:
    q = db.query(BlindSpot)
    if active:
        q = q.filter(BlindSpot.end_at.is_(None))
    if reachId:
        q = q.filter(BlindSpot.reach_id == reachId)
    rows = q.order_by(BlindSpot.start_at.desc()).all()
    return [
        BlindSpotOut(
            blindSpotId=b.blind_spot_id, eventId=b.event_id, reachId=b.reach_id,
            startAt=b.start_at, endAt=b.end_at, reason=b.reason,
            impact=b.impact, resolution=b.resolution,
        )
        for b in rows
    ]
