"""G2：月报导入/撤销的数据隔离核对（隔离内存库，不触碰开发库）。"""
from __future__ import annotations

from app.db.session import SessionLocal
from app.models.event import ActiveEvent
from app.models.observation import ImportBatch, Observation, OfficialMonthlyRecord
from app.models.workflow import InspectionTask

VALID_CSV = (
    "period,river_name,section_name,function_class,current_class,compliance,yoy_change,overproof\r\n"
    "2026-07,汉江,新沟*,Ⅲ,Ⅱ,达标,稳定,无\r\n"
    "2026-07,汉江,宗关,,Ⅱ,达标,稳定,无\r\n"
)


def _counts():
    db = SessionLocal()
    c = {
        "monthly": db.query(OfficialMonthlyRecord).count(),
        "batches": db.query(ImportBatch).count(),
        "observations": db.query(Observation).count(),
        "events": db.query(ActiveEvent).count(),
        "tasks": db.query(InspectionTask).count(),
    }
    db.close()
    return c


def test_import_revoke_isolation(client, token):
    before = _counts()

    # 预览（不应写月报记录）
    r = client.post(
        "/api/import/official-history",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("g2.csv", VALID_CSV.encode("utf-8"), "text/csv")},
    )
    assert r.status_code == 200
    preview = r.json()
    bid = preview["batchId"]
    assert preview["validRows"] == 2
    after_preview = _counts()
    assert after_preview["monthly"] == before["monthly"]  # 预览不落库

    # 确认：仅本批次月报记录 +2，其他表不变
    assert client.post(
        f"/api/import/official-history/{bid}/confirm",
        headers={"Authorization": f"Bearer {token}"}, json={},
    ).status_code == 200
    after_confirm = _counts()
    assert after_confirm["monthly"] == before["monthly"] + 2
    assert after_confirm["batches"] == before["batches"] + 1
    assert after_confirm["observations"] == before["observations"]
    assert after_confirm["events"] == before["events"]
    assert after_confirm["tasks"] == before["tasks"]
    # 记录确实归属本批次
    db = SessionLocal()
    assert db.query(OfficialMonthlyRecord).filter_by(batch_id=bid).count() == 2
    db.close()

    # 撤销：月报回到测试前，批次保留为 REVOKED；其他表不变
    assert client.post(
        f"/api/import/official-history/{bid}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    ).status_code == 200
    after_revoke = _counts()
    assert after_revoke["monthly"] == before["monthly"]
    assert after_revoke["observations"] == before["observations"]
    assert after_revoke["events"] == before["events"]
    assert after_revoke["tasks"] == before["tasks"]
    db = SessionLocal()
    status = db.query(ImportBatch).filter_by(batch_id=bid).one().status
    assert status == "REVOKED"
    db.close()

    # 重复撤销 → 409（不能重复删除）
    again = client.post(
        f"/api/import/official-history/{bid}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert again.status_code == 409
