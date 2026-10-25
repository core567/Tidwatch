"""附件上传/读取/权限/路径安全测试。"""
from __future__ import annotations

import io

import pytest


@pytest.fixture()
def uploaded(client, token, tmp_upload):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 200
    r = client.post(
        "/api/inspection-tasks/uploads",
        files={"file": ("现场照片.png", png, "image/png")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    return r.json()["attachmentId"]


@pytest.fixture()
def tmp_upload(monkeypatch, tmp_path):
    from app.core.config import settings
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


def test_upload_open_in_demo_mode(client):
    # 演示模式免登录：无 token 也能上传合法图片
    png = b"\x89PNG\r\n\x1a\n" + b"1" * 100
    r = client.post(
        "/api/inspection-tasks/uploads",
        files={"file": ("a.png", png, "image/png")},
    )
    assert r.status_code == 200


def test_reject_non_image(client, token, tmp_upload):
    r = client.post(
        "/api/inspection-tasks/uploads",
        files={"file": ("evil.exe", b"MZbinary", "application/octet-stream")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_meta_and_content_roundtrip(client, token, uploaded):
    m = client.get(
        f"/api/inspection-tasks/uploads/{uploaded}/meta",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert m.status_code == 200
    assert m.json()["attachmentId"] == uploaded

    c = client.get(
        f"/api/inspection-tasks/uploads/{uploaded}/content",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert c.status_code == 200
    assert c.headers["content-type"].startswith("image/")
    assert c.content.startswith(b"\x89PNG")


def test_download_sets_disposition(client, token, uploaded):
    c = client.get(
        f"/api/inspection-tasks/uploads/{uploaded}/content?download=true",
        headers={"Authorization": f"Bearer {token}"},
        follow_redirects=False,
    )
    assert c.status_code == 200
    assert "attachment" in c.headers.get("content-disposition", "")


def test_content_unknown_id_404(client, token):
    r = client.get(
        "/api/inspection-tasks/uploads/att-0000000000000000/content",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404


def test_path_traversal_id_rejected(client, token):
    # 含路径分隔符/.. 的 ID 不匹配白名单，按不存在处理（不触达文件系统）
    r = client.get(
        "/api/inspection-tasks/uploads/att-..%2f..%2fetc%2fpasswd/content",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404


def test_analyst_can_read_but_admin_only_is_for_write_not_needed(client, analyst_token, uploaded):
    # 普通登录用户可读自己有权访问的附件（统一 JWT 鉴权）
    r = client.get(
        f"/api/inspection-tasks/uploads/{uploaded}/content",
        headers={"Authorization": f"Bearer {analyst_token}"},
    )
    assert r.status_code == 200
