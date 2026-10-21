"""测试夹具：临时 SQLite + 种子用户 + TestClient。"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

# 必须在导入 app 配置前指定临时数据库
_tmp_dir = tempfile.mkdtemp(prefix="tidewatch_test_")
_db_path = Path(_tmp_dir) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path.as_posix()}"

from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.db.session import engine, SessionLocal  # noqa: E402
from app.models.system import User  # noqa: E402


@pytest.fixture(scope="session")
def client():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.add(
        User(
            user_id="u-admin",
            username="admin",
            display_name="系统管理员",
            password_hash=hash_password("Admin#2026"),
            role="admin",
            enabled=True,
        )
    )
    db.commit()
    db.close()

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def token(client) -> str:
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin#2026"},
    )
    assert resp.status_code == 200
    return resp.json()["accessToken"]
