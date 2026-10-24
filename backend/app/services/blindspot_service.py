"""监测盲区服务（GRP：无数据不能当作稳定证据）。

当关键观察点（事件 Focus 或事件范围内断面）数据链路中断时创建 BlindSpot；
盲区期间事件不得直接判定恢复；链路恢复后关闭盲区。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.focus import BlindSpot


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return f"blind-{uuid.uuid4().hex[:16]}"


def open_blind_spot(
    db: Session,
    reach_id: str,
    reason: str,
    *,
    event_id: str | None = None,
    impact: str = "关键观察点不可见，无法确认变化是否继续传播",
) -> BlindSpot:
    # 同一断面已有开放盲区则不重复创建
    existing = db.execute(
        select(BlindSpot).where(
            BlindSpot.reach_id == reach_id,
            BlindSpot.end_at.is_(None),
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    bs = BlindSpot(
        blind_spot_id=_id(),
        event_id=event_id,
        reach_id=reach_id,
        start_at=_now(),
        end_at=None,
        reason=reason,
        impact=impact,
        resolution=None,
    )
    db.add(bs)
    return bs


def resolve_blind_spot(
    db: Session,
    reach_id: str,
    resolution: str,
) -> BlindSpot | None:
    bs = db.execute(
        select(BlindSpot).where(
            BlindSpot.reach_id == reach_id,
            BlindSpot.end_at.is_(None),
        ).order_by(BlindSpot.start_at.desc())
    ).scalars().first()
    if bs is None:
        return None
    bs.end_at = _now()
    bs.resolution = resolution
    return bs


def has_open_blind_spot(db: Session, reach_ids: list[str]) -> bool:
    if not reach_ids:
        return False
    return db.execute(
        select(BlindSpot.blind_spot_id).where(
            BlindSpot.reach_id.in_(reach_ids),
            BlindSpot.end_at.is_(None),
        ).limit(1)
    ).scalar_one_or_none() is not None


def list_blind_spots(db: Session, *, active_only: bool = False) -> list[BlindSpot]:
    stmt = select(BlindSpot).order_by(BlindSpot.start_at.desc())
    if active_only:
        stmt = stmt.where(BlindSpot.end_at.is_(None))
    return list(db.execute(stmt).scalars())
