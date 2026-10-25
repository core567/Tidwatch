"""接口鉴权依赖。

V1.0 本地开发 / 竞赛演示环境：**免登录**。
- get_current_user / require_admin 直接返回固定演示用户（种子 admin），不校验 token；
- 所有 REST / SSE / WebSocket / 附件接口均可匿名访问；
- 保留 JWT 工具与用户表，公网部署时重新启用鉴权即可（见文件末说明）。

公网部署时应：
1. 恢复 get_current_user 的 Bearer/JWT 校验；
2. 给写操作与管理接口加 require_admin；
3. SSE/WS 恢复 query token 校验；
4. 评估接口滥用、上传限制与数据保护。
"""
from __future__ import annotations

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.system import User

_bearer = HTTPBearer(auto_error=False)

# 固定演示操作者（与种子数据 u-admin 对应）
DEMO_USER_ID = "u-admin"
DEMO_ROLE = "admin"


def _demo_user(db: Session) -> User:
    user = db.get(User, DEMO_USER_ID)
    if user is not None:
        return user
    # 种子库未初始化时返回一个未持久化的占位用户，保证演示链路可运行
    return User(user_id=DEMO_USER_ID, username="demo", display_name="演示用户",
                role=DEMO_ROLE, enabled=True)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """本地演示模式：恒返回演示用户，忽略凭据。"""
    return _demo_user(db)


def require_admin(
    db: Session = Depends(get_db),
) -> User:
    """本地演示模式：不做角色拦截，返回演示用户。"""
    return _demo_user(db)


def user_from_token(token: str | None, db: Session) -> User:
    """SSE/WS 复用：演示模式忽略 token，恒返回演示用户。"""
    return _demo_user(db)
