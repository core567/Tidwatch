"""/api/admin/diagnostics 诊断接口测试（V1.0 演示模式免登录）。"""
from __future__ import annotations


def test_diagnostics_open_in_demo_mode(client):
    # 演示模式：无需 token 即可访问
    assert client.get("/api/admin/diagnostics").status_code == 200


def test_diagnostics_shape(client, token):
    resp = client.get("/api/admin/diagnostics", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    b = resp.json()
    assert b["ruleVersion"] == "demo-rules-v1"
    assert b["appVersion"]
    # 计数结构完整
    for key in (
        "reachesOnline",
        "reachesStale",
        "reachesOffline",
        "observations",
        "processedMessages",
        "duplicateMessages",
        "ingestionErrors",
    ):
        assert key in b["counts"]
    assert isinstance(b["latestErrors"], list)
    assert b["mqtt"]["topicPrefix"] == "tidewatch/v1"


def test_ingestion_errors_open_in_demo_mode(client, token, analyst_token):
    # 演示模式：任意访问者均可读取死信明细（公网部署须重新加管理员鉴权）
    assert client.get("/api/admin/ingestion-errors").status_code == 200
    resp = client.get(
        "/api/admin/ingestion-errors",
        headers={"Authorization": f"Bearer {analyst_token}"},
    )
    assert resp.status_code == 200
    assert set(resp.json().keys()) == {"items", "page", "pageSize", "total"}
