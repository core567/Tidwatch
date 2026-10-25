"""/api/reaches 与观测查询接口测试。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.observation import Observation

# 独立时间窗，避免与其他测试数据混淆
T0 = datetime(2030, 1, 1, 0, 0, tzinfo=timezone.utc)


def _insert(reach: str, metric: str, value: float, unit: str, minute: int,
            source="SIMULATED", quality="GOOD", scenario="APITEST") -> str:
    db = SessionLocal()
    oid = f"obs-{uuid.uuid4().hex[:20]}"
    db.add(
        Observation(
            observation_id=oid,
            reach_id=reach,
            metric=metric,
            value=value,
            unit=unit,
            observed_at=T0.replace(minute=minute),
            ingested_at=T0.replace(minute=minute),
            source_type=source,
            source_name=f"scenario-{scenario}",
            scenario_id=scenario,
            quality_flag=quality,
            rule_version="demo-rules-v1",
            dedup_key=f"apitest-{uuid.uuid4().hex}",
        )
    )
    db.commit()
    db.close()
    return oid


def test_reaches_open_in_demo_mode(client):
    assert client.get("/api/reaches").status_code == 200


def test_list_reaches(client, token):
    resp = client.get("/api/reaches", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    items = resp.json()
    assert [r["reachId"] for r in items] == ["reach-a", "reach-b", "reach-c"]
    a = items[0]
    # camelCase + 关键字段
    assert a["role"] == "upstream"
    assert a["coordinateStatus"] == "LOGICAL"
    assert a["officialCandidateName"] == "新沟"
    assert "lastSeenAt" in a


def test_unknown_reach_404(client, token):
    h = {"Authorization": f"Bearer {token}"}
    resp = client.get("/api/reaches/reach-z/latest", headers=h)
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"


def test_observations_filter_paging_latest(client, token):
    h = {"Authorization": f"Bearer {token}"}
    _insert("reach-b", "waterLevel", 4.5, "m", 0)
    _insert("reach-b", "waterLevel", 7.6, "m", 10)
    _insert("reach-b", "turbidity", 20, "NTU", 10)
    _insert("reach-b", "waterLevel", 9.0, "m", 20, quality="SUSPECT")

    # metric 过滤 + 时间窗 + 升序
    resp = client.get(
        "/api/reaches/reach-b/observations",
        headers=h,
        params={
            "metric": "waterLevel",
            "from": T0.isoformat(),
            "to": T0.replace(minute=30).isoformat(),
            "order": "asc",
            "pageSize": 2,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert body["pageSize"] == 2
    assert [o["value"] for o in body["items"]] == [4.5, 7.6]
    assert body["items"][0]["sourceType"] == "SIMULATED"
    assert body["items"][0]["observedAt"].startswith("2030-01-01")

    # 第二页
    resp2 = client.get(
        "/api/reaches/reach-b/observations",
        headers=h,
        params={"metric": "waterLevel", "from": T0.isoformat(), "order": "asc",
                "page": 2, "pageSize": 2},
    )
    assert [o["value"] for o in resp2.json()["items"]] == [9.0]

    # quality 过滤
    resp3 = client.get(
        "/api/reaches/reach-b/observations",
        headers=h,
        params={"quality": "SUSPECT", "from": T0.isoformat()},
    )
    assert resp3.json()["total"] == 1

    # latest：每个指标一条，取最大观测时间
    latest = client.get("/api/reaches/reach-b/latest", headers=h).json()
    by_metric = {o["metric"]: o for o in latest}
    assert by_metric["waterLevel"]["value"] == 9.0
    assert by_metric["turbidity"]["value"] == 20


def test_bad_paging_params_rejected(client, token):
    h = {"Authorization": f"Bearer {token}"}
    assert client.get(
        "/api/reaches/reach-a/observations?pageSize=99999", headers=h
    ).status_code == 422
    assert client.get(
        "/api/reaches/reach-a/observations?order=sideways", headers=h
    ).status_code == 422
