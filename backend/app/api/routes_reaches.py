"""监测点与观测查询路由（GRP 8.2）。"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.system import User
from app.schemas.common import PageResult
from app.schemas.observation import ObservationOut
from app.schemas.reach import ReachOut
from app.services import observation_service as obs_svc
from app.services import reach_service

router = APIRouter(prefix="/api", tags=["reaches"], dependencies=[Depends(get_current_user)])


@router.get("/reaches", response_model=list[ReachOut])
def list_reaches(db: Session = Depends(get_db)) -> list[ReachOut]:
    return [reach_service.to_reach_out(r) for r in reach_service.list_reaches(db)]


@router.get("/reaches/{reach_id}", response_model=ReachOut)
def get_reach(reach_id: str, db: Session = Depends(get_db)) -> ReachOut:
    return reach_service.to_reach_out(reach_service.get_reach(db, reach_id))


@router.get("/reaches/{reach_id}/latest", response_model=list[ObservationOut])
def latest_metrics(reach_id: str, db: Session = Depends(get_db)) -> list[ObservationOut]:
    reach_service.get_reach(db, reach_id)  # 不存在时返回 404
    return [obs_svc.to_out(o) for o in obs_svc.latest_per_metric(db, reach_id)]


@router.get("/reaches/{reach_id}/observations", response_model=PageResult[ObservationOut])
def list_observations(
    reach_id: str,
    metric: str | None = None,
    sourceType: str | None = None,
    quality: str | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> PageResult[ObservationOut]:
    reach_service.get_reach(db, reach_id)  # 404 on unknown reach
    rows, total = obs_svc.query_observations(
        db,
        reach_id,
        metric=metric,
        source_type=sourceType,
        quality_flag=quality,
        date_from=from_,
        date_to=to,
        page=page,
        page_size=pageSize,
        order=order,
    )
    return PageResult[ObservationOut](
        items=[obs_svc.to_out(o) for o in rows],
        page=page,
        page_size=pageSize,
        total=total,
    )
