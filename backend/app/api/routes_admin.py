"""系统管理与运行诊断路由（P12）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes_import import require_admin
from app.core.config import settings
from app import __version__
from app.db.session import get_db
from app.models.ingestion import IngestionError, ProcessedMessage
from app.models.observation import Observation
from app.models.reach import Reach
from app.models.system import RuleConfig, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/diagnostics")
def diagnostics(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict:
    def count(model, *filters) -> int:
        return int(
            db.execute(select(func.count()).select_from(model).where(*filters)).scalar_one()
        )

    reaches = db.execute(select(Reach)).scalars().all()
    rule = db.get(RuleConfig, settings.rule_version)
    latest_errors = [
        {
            "errorId": e.error_id,
            "source": e.source,
            "topic": e.topic,
            "reason": e.reason,
            "detail": (e.detail or "")[:300],
            "receivedAt": e.received_at.isoformat() if e.received_at else None,
        }
        for e in db.execute(
            select(IngestionError).order_by(IngestionError.received_at.desc()).limit(8)
        ).scalars()
    ]

    return {
        "appVersion": __version__,
        "ruleVersion": settings.rule_version,
        "ruleLabel": rule.label if rule else None,
        "mqtt": {
            # 配置项；真实连接状态由在线/陈旧断面体现
            "enabled": settings.mqtt_enabled,
            "host": settings.mqtt_host,
            "port": settings.mqtt_port,
            "topicPrefix": settings.mqtt_topic_prefix,
            "staleSeconds": settings.mqtt_stale_seconds,
        },
        "counts": {
            "reachesOnline": sum(1 for r in reaches if r.online_status == "ONLINE"),
            "reachesStale": sum(1 for r in reaches if r.online_status == "STALE"),
            "reachesOffline": sum(1 for r in reaches if r.online_status == "OFFLINE"),
            "observations": count(Observation),
            "processedMessages": count(ProcessedMessage),
            "duplicateMessages": int(
                db.execute(
                    select(func.coalesce(func.sum(ProcessedMessage.duplicate_count), 0))
                ).scalar_one()
            ),
            "ingestionErrors": count(IngestionError),
        },
        "latestErrors": latest_errors,
    }


@router.get("/ingestion-errors")
def list_ingestion_errors(
    reason: str | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    filters = []
    if reason:
        filters.append(IngestionError.reason == reason)
    total = int(
        db.execute(
            select(func.count()).select_from(IngestionError).where(*filters)
        ).scalar_one()
    )
    rows = db.execute(
        select(IngestionError)
        .where(*filters)
        .order_by(IngestionError.received_at.desc())
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    ).scalars()
    return {
        "items": [
            {
                "errorId": e.error_id,
                "source": e.source,
                "topic": e.topic,
                "reason": e.reason,
                "detail": e.detail,
                "rawPayload": (e.raw_payload or "")[:500],
                "receivedAt": e.received_at.isoformat() if e.received_at else None,
            }
            for e in rows
        ],
        "page": page,
        "pageSize": pageSize,
        "total": total,
    }
