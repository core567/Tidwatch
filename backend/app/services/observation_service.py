"""观测查询服务：时间线按 observedAt 组织，ingestedAt 仅用于审计。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.observation import Observation
from app.schemas.observation import ObservationOut


def query_observations(
    db: Session,
    reach_id: str,
    *,
    metric: str | None = None,
    source_type: str | None = None,
    quality_flag: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = 1,
    page_size: int = 50,
    order: str = "desc",
) -> tuple[list[Observation], int]:
    filters = [Observation.reach_id == reach_id]
    if metric:
        filters.append(Observation.metric == metric)
    if source_type:
        filters.append(Observation.source_type == source_type)
    if quality_flag:
        filters.append(Observation.quality_flag == quality_flag)
    if date_from:
        filters.append(Observation.observed_at >= date_from)
    if date_to:
        filters.append(Observation.observed_at <= date_to)

    total = db.execute(
        select(func.count()).select_from(Observation).where(*filters)
    ).scalar_one()

    direction = Observation.observed_at.asc() if order == "asc" else Observation.observed_at.desc()
    rows = list(
        db.execute(
            select(Observation)
            .where(*filters)
            .order_by(direction, Observation.ingested_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).scalars()
    )
    return rows, int(total)


def latest_per_metric(db: Session, reach_id: str) -> list[Observation]:
    """每个指标各取 observedAt 最新的一条。"""
    latest_time = (
        select(Observation.metric, func.max(Observation.observed_at).label("mx"))
        .where(Observation.reach_id == reach_id)
        .group_by(Observation.metric)
        .subquery()
    )
    rows = list(
        db.execute(
            select(Observation)
            .join(
                latest_time,
                (Observation.metric == latest_time.c.metric)
                & (Observation.observed_at == latest_time.c.mx),
            )
            .where(Observation.reach_id == reach_id)
            .order_by(Observation.metric)
        ).scalars()
    )
    return rows


def to_out(o: Observation) -> ObservationOut:
    return ObservationOut(
        observation_id=o.observation_id,
        reach_id=o.reach_id,
        metric=o.metric,
        value=o.value,
        unit=o.unit,
        observed_at=o.observed_at,
        ingested_at=o.ingested_at,
        source_type=o.source_type,
        source_name=o.source_name,
        source_ref=o.source_ref,
        scenario_id=o.scenario_id,
        quality_flag=o.quality_flag,
        rule_version=o.rule_version,
    )
