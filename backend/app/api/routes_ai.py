"""AI 助手路由：/api/ai/chat（只读问答）与 /api/ai/status（模式检测）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.system import User
from app.ai import service, llm

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.get("/status")
def ai_status(_user: User = Depends(get_current_user)) -> dict:
    configured = settings.ai_configured
    return {
        "aiEnabled": settings.ai_enabled,
        "configured": configured,
        "mode": "llm" if configured else "rule",
        "model": settings.ai_model or None,
        "toolCallSupported": True,  # 适配层支持；具体模型能力在首次调用时验证
    }


@router.post("/chat")
def ai_chat(body: ChatIn, db: Session = Depends(get_db), _user: User = Depends(get_current_user)) -> dict:
    result = service.respond(db, body.message)
    return result
