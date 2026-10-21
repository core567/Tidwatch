"""鉴权契约。"""
from __future__ import annotations

from datetime import datetime

from app.schemas.base import CamelModel


class LoginRequest(CamelModel):
    username: str
    password: str


class UserOut(CamelModel):
    user_id: str
    username: str
    display_name: str
    role: str  # admin / analyst / inspector


class LoginResponse(CamelModel):
    access_token: str
    token_type: str = "Bearer"
    expires_at: datetime
    user: UserOut
