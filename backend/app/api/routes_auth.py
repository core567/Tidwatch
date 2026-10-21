"""账号密码登录 → JWT。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.system import User
from app.schemas.auth import LoginRequest, LoginResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.execute(
        select(User).where(User.username == body.username.strip())
    ).scalar_one_or_none()

    # 不区分“用户不存在/密码错误”，避免枚举账号
    if user is None or not verify_password(body.password, user.password_hash):
        raise AppError("INVALID_CREDENTIALS", "账号或密码错误", 401)
    if not user.enabled:
        raise AppError("ACCOUNT_DISABLED", "账号已停用", 403)

    token, expires_at = create_access_token(user.user_id, user.role)
    return LoginResponse(
        access_token=token,
        expires_at=expires_at,
        user=UserOut(
            user_id=user.user_id,
            username=user.username,
            display_name=user.display_name,
            role=user.role,
        ),
    )
