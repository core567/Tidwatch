"""接口鉴权依赖。"""
from __future__ import annotations

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.system import User

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if cred is None:
        raise AppError("UNAUTHORIZED", "缺少访问令牌", 401)
    return user_from_token(cred.credentials, db)


def user_from_token(token: str | None, db: Session) -> User:
    """SSE/WS 无法设置请求头，通过 query 参数 token 鉴权时复用。"""
    if not token:
        raise AppError("UNAUTHORIZED", "缺少访问令牌", 401)
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise AppError("TOKEN_EXPIRED", "登录已过期，请重新登录", 401)
    except jwt.PyJWTError:
        raise AppError("INVALID_TOKEN", "访问令牌无效", 401)
    user = db.get(User, payload["sub"])
    if user is None or not user.enabled:
        raise AppError("UNAUTHORIZED", "用户不存在或已停用", 401)
    return user
