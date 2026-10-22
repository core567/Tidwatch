"""/api/admin/diagnostics 诊断接口测试。"""
from __future__ import annotations


def test_diagnostics_requires_auth(client):
    assert client.get("/api/admin/diagnostics").status_code == 401


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


def test_ingestion_errors_admin_only(client, token, analyst_token):
    # analyst 不是管理员，死信明细 403
    assert client.get(
        "/api/admin/ingestion-errors",
        headers={"Authorization": f"Bearer {analyst_token}"},
    ).status_code == 403
    resp = client.get(
        "/api/admin/ingestion-errors",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert set(resp.json().keys()) == {"items", "page", "pageSize", "total"}
