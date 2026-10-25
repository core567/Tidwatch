"""巡检任务路由：PC 派发/查询，小程序接受/开始/回填，附件上传。"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes_import import require_admin
from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.db.session import get_db
from app.models.system import User
from app.schemas.common import PageResult
from app.schemas.task import (
    CreateTaskIn,
    SubmitTaskIn,
    TaskActionIn,
    TaskOut,
)
from app.services import task_service

router = APIRouter(prefix="/api/inspection-tasks", tags=["inspection"])


def _out(t) -> TaskOut:
    return TaskOut(
        taskId=t.task_id, eventId=t.event_id, focusId=t.focus_id,
        reachId=t.reach_id, actionType=t.action_type, title=t.title,
        priority=t.priority, status=t.status, assignee=t.assignee,
        dueAt=t.due_at, reason=t.reason, resultNote=t.result_note,
        resultConclusion=t.result_conclusion,
        attachmentIds=json.loads(t.attachment_ids or "[]"),
        observedAt=t.observed_at, completedAt=t.completed_at,
        createdAt=t.created_at,
    )


@router.get("", response_model=PageResult[TaskOut])
def list_tasks(
    status: str | None = None,
    assignee: str | None = None,
    eventId: str | None = None,
    mine: bool = False,
    page: int = 1,
    pageSize: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 演示模式免登录：mine 也返回全部任务（公网启用鉴权后再按用户/角色过滤）
    if mine:
        rows = task_service.list_tasks(db, status=status, event_id=eventId)
    else:
        rows = task_service.list_tasks(
            db, status=status, assignee=assignee, event_id=eventId
        )
    total = len(rows)
    chunk = rows[(page - 1) * pageSize: page * pageSize]
    return PageResult[TaskOut](
        items=[_out(t) for t in chunk], page=page, pageSize=pageSize, total=total
    )


@router.post("", response_model=TaskOut)
def create_task(
    body: CreateTaskIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    task = task_service.create_task(
        db, event_id=body.event_id, focus_id=body.focus_id,
        reach_id=body.reach_id, action_type=body.action_type, title=body.title,
        priority=body.priority, due_at=body.due_at, reason=body.reason,
        assignee=body.assignee, created_by=_admin.user_id,
    )
    db.commit()
    _notify_task(task, "task.created")
    return _out(task)


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return _out(task_service.get_task(db, task_id))


@router.post("/{task_id}/actions", response_model=TaskOut)
def task_action(
    task_id: str,
    body: TaskActionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = task_service.act_task(
        db, task_id, body.action, actor=user.user_id, assignee=user.user_id
    )
    db.commit()
    _notify_task(task, "task.updated")
    return _out(task)


@router.post("/{task_id}/results", response_model=TaskOut)
def submit_result(
    task_id: str,
    body: SubmitTaskIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = task_service.submit_result(
        db, task_id, observation_note=body.observation_note,
        conclusion=body.conclusion, attachment_ids=body.attachment_ids,
        observed_at=body.observed_at, actor=user.user_id,
    )
    db.commit()
    _notify_task(task, "task.updated")
    return _out(task)


def _notify_task(task, message_type: str = "task.updated") -> None:
    """任务状态变化时经实时 Hub 推送（SSE 与 WS 共用）。"""
    from app.realtime.hub import hub

    hub.publish_threadsafe(
        message_type,
        {
            "taskId": task.task_id, "eventId": task.event_id,
            "reachId": task.reach_id, "status": task.status,
            "assignee": task.assignee,
        },
    )


@router.post("/uploads")
async def upload_attachment(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """巡检照片/图片上传，返回 attachmentId（元数据，供结果回填引用）。"""
    content = await file.read()
    limit = settings.max_upload_mb * 1024 * 1024
    if len(content) > limit:
        raise AppError("FILE_TOO_LARGE", f"文件超过 {settings.max_upload_mb}MB", 422)
    allowed = {".jpg", ".jpeg", ".png", ".webp"}
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in allowed:
        raise AppError("UNSUPPORTED_FILE", "仅支持 jpg/png/webp 图片", 422)
    att_id = f"att-{uuid.uuid4().hex[:16]}"
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / f"{att_id}{suffix}").write_bytes(content)
    # 记录一行元数据到 attachments 表
    from app.models.observation import Attachment
    db.add(Attachment(
        attachment_id=att_id, filename=file.filename,
        stored_path=f"{att_id}{suffix}", mime_type=file.content_type or "image/jpeg",
        size_bytes=len(content), uploaded_by=_user.user_id,
    ))
    db.commit()
    return {"attachmentId": att_id, "filename": file.filename, "sizeBytes": len(content)}


@router.get("/uploads/{attachment_id}/meta")
def attachment_meta(
    attachment_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    from app.models.observation import Attachment
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise NotFoundError("附件", attachment_id)
    return {
        "attachmentId": att.attachment_id, "filename": att.filename,
        "mimeType": att.mime_type, "sizeBytes": att.size_bytes,
    }


import re as _re

_ATTACHMENT_ID_RE = _re.compile(r"^att-[0-9a-f]{16,32}$")
_SAFE_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
_SAFE_MIME = {"image/jpeg", "image/png", "image/webp"}


@router.get("/uploads/{attachment_id}/content")
def attachment_content(
    attachment_id: str,
    download: bool = False,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """安全读取附件图片（内联预览或下载）。需登录，ID 与路径双重校验。"""
    from fastapi.responses import FileResponse
    from app.models.observation import Attachment

    if not _ATTACHMENT_ID_RE.match(attachment_id):
        raise NotFoundError("附件", attachment_id)
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise NotFoundError("附件", attachment_id)

    upload_dir = Path(settings.upload_dir).resolve()
    # stored_path 仅为服务端生成的文件名；取 basename 并校验解析后仍在 upload 目录内
    stored_name = Path(att.stored_path).name
    file_path = (upload_dir / stored_name).resolve()
    if upload_dir not in file_path.parents or file_path.suffix.lower() not in _SAFE_IMAGE_EXT:
        raise AppError("ATTACHMENT_UNSAFE", "附件路径非法", 400)
    if not file_path.is_file():
        raise NotFoundError("附件文件", attachment_id)

    mime = att.mime_type if att.mime_type in _SAFE_MIME else "application/octet-stream"
    headers: dict[str, str] = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{attachment_id}{file_path.suffix}"'
    return FileResponse(file_path, media_type=mime, headers=headers)


@router.get("/{task_id}/attachments")
def task_attachments(
    task_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """返回任务回填的附件元数据 + 内容 URL（图片需经同一鉴权读取）。"""
    from app.models.observation import Attachment as AttModel
    task = task_service.get_task(db, task_id)
    ids = json.loads(task.attachment_ids or "[]")
    rows = db.query(AttModel).filter(AttModel.attachment_id.in_(ids)).all()
    by_id = {a.attachment_id: a for a in rows}
    return {
        "items": [
            {
                "attachmentId": aid,
                "filename": (by_id[aid].filename if aid in by_id else aid),
                "mimeType": (by_id[aid].mime_type if aid in by_id else "image/jpeg"),
                "contentUrl": f"/api/inspection-tasks/uploads/{aid}/content",
            }
            for aid in ids if aid in by_id
        ]
    }
