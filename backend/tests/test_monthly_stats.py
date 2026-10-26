"""回归：月报统计接口以明细行 period 为准，不依赖批次 published_period。"""
from __future__ import annotations

VALID_CSV = (
    "period,river_name,section_name,function_class,current_class,compliance,yoy_change,overproof\r\n"
    "2026-05,汉江,新沟*,Ⅲ,Ⅱ,达标,稳定,无\r\n"
    "2026-05,汉江,宗关,,Ⅲ,达标,稳定,无\r\n"
)


def test_monthly_stats_uses_record_period(client, token):
    # 上传并确认（不依赖批次是否解析出单一 published_period）
    r = client.post(
        "/api/import/official-history",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("m.csv", VALID_CSV.encode("utf-8"), "text/csv")},
    )
    assert r.status_code == 200
    bid = r.json()["batchId"]
    assert client.post(
        f"/api/import/official-history/{bid}/confirm",
        headers={"Authorization": f"Bearer {token}"}, json={},
    ).status_code == 200

    # 统计接口必须 200（历史 bug：访问不存在的 batch.period 抛 500）
    r = client.get("/api/reports/monthly", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["totalRecords"] == 2
    assert body["byPeriod"].get("2026-05") == 2
    assert body["byClass"].get("Ⅱ") == 1
    # 断面匹配为 reach-a/reach-b（候选名映射，新沟→reach-a）
    assert sum(body["byReach"].values()) >= 1

    # 撤销后统计归零（批次仍计数，明细删除）
    assert client.post(
        f"/api/import/official-history/{bid}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    ).status_code == 200
    body2 = client.get("/api/reports/monthly", headers={"Authorization": f"Bearer {token}"}).json()
    assert body2["totalRecords"] == 0
    assert body2["byPeriod"] == {}
