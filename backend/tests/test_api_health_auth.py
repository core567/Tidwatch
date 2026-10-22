"""/api/health 与 /api/auth/login 集成测试。"""
from __future__ import annotations


def test_health_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert "version" in body


def test_login_success_token_shape(client):
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin#2026"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tokenType"] == "Bearer"
    assert body["accessToken"]
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "admin"
    assert "passwordHash" not in resp.text


def test_login_wrong_password_unified_error(client):
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert resp.status_code == 401
    body = resp.json()
    # 统一错误结构 GRP 7.4
    assert body["code"] == "INVALID_CREDENTIALS"
    assert "message" in body and "requestId" in body


def test_login_validation_error_structure(client):
    resp = client.post("/api/auth/login", json={"username": "admin"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_FAILED"


def test_me_restores_session(client, token):
    # 有 token：返回当前用户
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"
    # 无 token / 坏 token：401
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
