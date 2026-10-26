"""研判单（P08）与历史分析（P09）路由。"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes_import import require_admin
from app.db.session import get_db
from app.models.event import ActiveEvent, EventScope
from app.models.observation import ImportBatch, OfficialMonthlyRecord
from app.models.system import User
from app.models.workflow import EventReview
from app.services import report_service

router = APIRouter(tags=["reports"])


@router.get("/api/events/{event_id}/review")
def event_review(
    event_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """在线研判单（实时聚合，不落库）。"""
    return report_service.build_review_payload(db, event_id)


@router.post("/api/events/{event_id}/review")
def generate_review(
    event_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """生成并持久化研判单快照。"""
    review = report_service.persist_review(db, event_id, created_by=user.user_id)
    db.commit()
    return {
        "reviewId": review.review_id,
        "eventId": review.event_id,
        "createdBy": review.created_by,
        "payload": json.loads(review.evidence_snapshot_json),
    }


@router.get("/api/reports/monthly")
def monthly_analysis(
    year: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """P09：官方月报导入数据分析（类别/断面/月份统计）。"""
    q = select(OfficialMonthlyRecord)
    rows = list(db.execute(q).scalars())

    def period_of(r: OfficialMonthlyRecord) -> str:
        # 月份以明细行自身的 period（YYYY-MM）为准；批次 published_period 可能为空
        return getattr(r, "period", None) or "unknown"

    by_class: Counter = Counter()
    by_reach: Counter = Counter()
    by_period: Counter = Counter()
    batches_set: set[str] = set()
    for r in rows:
        by_class[r.current_class] += 1
        if r.matched_reach_id:
            by_reach[r.matched_reach_id] += 1
        by_period[period_of(r)] += 1
        batches_set.add(r.batch_id)

    batches = list(db.execute(select(ImportBatch).order_by(ImportBatch.created_at.desc())).scalars())
    return {
        "totalRecords": len(rows),
        "totalBatches": len(batches),
        "byClass": dict(by_class),
        "byReach": dict(by_reach),
        "byPeriod": dict(sorted(by_period.items())),
        "batches": [
            {
                "batchId": b.batch_id, "period": b.published_period, "agency": b.agency,
                "status": b.status, "rowCount": b.row_count,
                "sourceUrl": b.source_url,
                "createdAt": b.created_at.isoformat() if b.created_at else None,
            }
            for b in batches
        ],
    }


@router.get("/api/reports/event-frequency")
def event_frequency(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """P09：异常事件频次分析（按状态/类型/断面范围）。"""
    events = list(db.execute(select(ActiveEvent)).scalars())
    by_status = Counter(e.status for e in events)
    by_type = Counter(e.event_type for e in events)
    scope_counter: Counter = Counter()
    for e in events:
        latest = db.execute(
            select(EventScope.reaches_json)
            .where(EventScope.event_id == e.event_id)
            .order_by(EventScope.version.desc())
            .limit(1)
        ).scalar_one_or_none()
        for rid in json.loads(latest or "[]"):
            scope_counter[rid] += 1
    return {
        "totalEvents": len(events),
        "byStatus": dict(by_status),
        "byType": dict(by_type),
        "eventsPerReach": dict(scope_counter),
    }
