"""官方历史月报导入与查询路由（GRP 6.4：预览→确认两阶段）。"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.ingestion import official_importer as imp
from app.models.observation import ImportBatch, OfficialMonthlyRecord
from app.models.system import User
from app.schemas.importer import (
    BatchOut,
    ConfirmIn,
    MonthlyRecordOut,
    PreviewOut,
)

router = APIRouter(prefix="/api", tags=["official-history"])


# 本地演示免鉴权：直接复用 get_current_user（恒为演示用户）
def require_admin(user: User = Depends(get_current_user)) -> User:
    return user


def _to_preview(batch: ImportBatch) -> PreviewOut:
    report = json.loads(batch.validation_report or "{}")
    rows = report.get("rows", [])
    return PreviewOut(
        batch_id=batch.batch_id,
        source_kind=batch.source_kind,
        original_filename=batch.original_filename,
        agency=batch.agency,
        source_url=batch.source_url,
        published_period=batch.published_period,
        published_at=batch.published_at,
        status=batch.status,
        total_rows=len(rows),
        valid_rows=sum(1 for r in rows if not r["errors"]),
        invalid_rows=sum(1 for r in rows if r["errors"]),
        rows=rows,
    )


@router.post("/import/official-history", response_model=PreviewOut)
async def preview_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> PreviewOut:
    content = await file.read()
    limit = settings.max_upload_mb * 1024 * 1024
    if len(content) > limit:
        raise AppError("FILE_TOO_LARGE", f"文件超过 {settings.max_upload_mb}MB 限制", 422)
    batch, _ = imp.preview_import(db, file.filename or "unknown", content, _admin.user_id)
    return _to_preview(batch)


@router.post("/import/official-history/{batch_id}/confirm", response_model=BatchOut)
def confirm_upload(
    batch_id: str,
    body: ConfirmIn | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> BatchOut:
    batch = imp.confirm_import(
        db,
        batch_id,
        agency=body.agency if body else None,
        source_url=body.source_url if body else None,
        published_at=body.published_at if body else None,
    )
    return _to_batch(batch)


@router.post("/import/official-history/{batch_id}/revoke", response_model=BatchOut)
def revoke_upload(
    batch_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> BatchOut:
    return _to_batch(imp.revoke_batch(db, batch_id))


@router.get("/import/batches", response_model=list[BatchOut])
def list_batches(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[BatchOut]:
    rows = db.execute(
        select(ImportBatch).order_by(ImportBatch.created_at.desc())
    ).scalars()
    return [_to_batch(b) for b in rows]


@router.get("/official-monthly-records", response_model=list[MonthlyRecordOut])
def list_monthly(
    period: str | None = None,
    river: str | None = None,
    section: str | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[MonthlyRecordOut]:
    stmt = select(OfficialMonthlyRecord).order_by(
        OfficialMonthlyRecord.period, OfficialMonthlyRecord.record_id
    )
    if period:
        stmt = stmt.where(OfficialMonthlyRecord.period == period)
    if river:
        stmt = stmt.where(OfficialMonthlyRecord.river_name.contains(river))
    if section:
        stmt = stmt.where(OfficialMonthlyRecord.section_name.contains(section))
    out: list[MonthlyRecordOut] = []
    for r in db.execute(stmt).scalars():
        out.append(
            MonthlyRecordOut(
                record_id=r.record_id,
                batch_id=r.batch_id,
                period=r.period,
                river_name=r.river_name,
                section_name=r.section_name,
                function_class=r.function_class,
                current_class=r.current_class,
                compliance=r.compliance,
                yoy_change=r.yoy_change,
                overproof=json.loads(r.overproof_json or "[]"),
                matched_reach_id=r.matched_reach_id,
            )
        )
    return out


def _to_batch(b: ImportBatch) -> BatchOut:
    return BatchOut(
        batch_id=b.batch_id,
        source_kind=b.source_kind,
        original_filename=b.original_filename,
        agency=b.agency,
        source_url=b.source_url,
        published_period=b.published_period,
        published_at=b.published_at,
        status=b.status,  # type: ignore[arg-type]
        row_count=b.row_count,
        imported_by=b.imported_by,
        created_at=b.created_at,
    )
