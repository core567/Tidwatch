"""监测点查询服务。"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.reach import Reach
from app.schemas.reach import ReachOut


def list_reaches(db: Session) -> list[Reach]:
    return list(db.execute(select(Reach).order_by(Reach.topo_order)).scalars())


def get_reach(db: Session, reach_id: str) -> Reach:
    reach = db.get(Reach, reach_id)
    if reach is None:
        raise NotFoundError("监测点", reach_id)
    return reach


def to_reach_out(reach: Reach) -> ReachOut:
    return ReachOut(
        reach_id=reach.reach_id,
        name=reach.name,
        role=reach.role,
        topo_order=reach.topo_order,
        online_status=reach.online_status,
        last_seen_at=reach.last_seen_at,
        coordinate_status=reach.coordinate_status,
        longitude=reach.longitude,
        latitude=reach.latitude,
        coordinate_source=reach.coordinate_source,
        official_candidate_name=reach.official_candidate_name,
    )
