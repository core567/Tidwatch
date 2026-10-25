"""官方月报导入测试：预览→确认→查询→撤销全流程 + 权限与校验。"""
from __future__ import annotations

from app.db.session import SessionLocal
from app.ingestion import official_importer as imp
from app.models.observation import ImportBatch, OfficialMonthlyRecord

VALID_CSV = (
    "period,river_name,section_name,function_class,current_class,compliance,yoy_change,overproof\r\n"
    "2026-07,汉江,新沟*,Ⅲ,Ⅱ,达标,稳定,无\r\n"
    "2026-07,汉江,宗关,,Ⅱ,达标,稳定,无\r\n"
    "2026-07,汉江,龙王庙,,Ⅱ,达标,好转,无\r\n"
)


def _cleanup(batch_id: str) -> None:
    db = SessionLocal()
    db.query(OfficialMonthlyRecord).filter(
        OfficialMonthlyRecord.batch_id == batch_id
    ).delete()
    db.query(ImportBatch).filter(ImportBatch.batch_id == batch_id).delete()
    db.commit()
    db.close()


def test_preview_confirm_query_revoke(client):
    db = SessionLocal()
    try:
        batch, rows = imp.preview_import(db, "2026-07.csv", VALID_CSV.encode("utf-8"))
        assert len(rows) == 3
        assert all(not r["errors"] for r in rows)
        # 入境断面星号去除后匹配逻辑点；龙王庙→reach-c
        by_section = {r["normalized"]["sectionName"]: r for r in rows}
        assert by_section["新沟*"]["matchedReachId"] == "reach-a"
        assert by_section["宗关"]["matchedReachId"] == "reach-b"
        assert by_section["龙王庙"]["matchedReachId"] == "reach-c"
        assert batch.status == "PREVIEW"
        # 确认前没有正式记录
        assert db.query(OfficialMonthlyRecord).count() == 0

        imp.confirm_import(
            db,
            batch.batch_id,
            agency="武汉市生态环境监控中心",
            source_url="https://example.gov.cn/report",
        )
        records = db.query(OfficialMonthlyRecord).filter(
            OfficialMonthlyRecord.batch_id == batch.batch_id
        ).all()
        assert len(records) == 3
        xingou = next(r for r in records if r.section_name == "新沟*")
        assert xingou.current_class == "Ⅱ" and xingogou_check(xingou)
        assert xingou.matched_reach_id == "reach-a"
        assert db.get(ImportBatch, batch.batch_id).row_count == 3

        # 重复确认拒绝
        import pytest
        from app.core.errors import ConflictError
        with pytest.raises(ConflictError):
            imp.confirm_import(db, batch.batch_id)

        # 撤销：记录删除但批次保留为 REVOKED
        imp.revoke_batch(db, batch.batch_id)
        assert db.query(OfficialMonthlyRecord).filter(
            OfficialMonthlyRecord.batch_id == batch.batch_id
        ).count() == 0
        assert db.get(ImportBatch, batch.batch_id).status == "REVOKED"
        _cleanup(batch.batch_id)
    finally:
        db.close()


def xingogou_check(r) -> bool:
    # 原报告“*”入境标记必须在断面名中保留
    return r.section_name.endswith("*")


def test_invalid_rows_reported_not_blocked(client):
    csv = (
        "period,river_name,section_name,current_class\r\n"
        "bad-month,汉江,宗关,Ⅱ\r\n"           # 月份错误
        "2026-08,,龙王庙,Ⅱ\r\n"              # 河流为空
        "2026-08,汉江,测试断面,劣Ⅴ\r\n"       # 有效行（断面无法匹配仅不匹配，不是错误）
    )
    db = SessionLocal()
    batch, rows = imp.preview_import(db, "bad.csv", csv.encode("utf-8"))
    assert len(rows) == 3
    assert rows[0]["errors"] and "月份" in rows[0]["errors"][0]
    assert rows[1]["errors"]
    # 只有第三行有效；确认时只导入有效行
    imp.confirm_import(db, batch.batch_id)
    records = db.query(OfficialMonthlyRecord).filter(
        OfficialMonthlyRecord.batch_id == batch.batch_id
    ).all()
    assert len(records) == 1 and records[0].section_name == "测试断面"
    _cleanup(batch.batch_id)
    db.close()


def test_missing_required_column_rejected(client):
    from app.core.errors import AppError
    db = SessionLocal()
    try:
        import pytest
        with pytest.raises(AppError) as exc:
            imp.preview_import(db, "x.csv", "a,b\n1,2\n".encode())
        assert exc.value.code == "MAPPING_FAILED"
    finally:
        db.close()


def test_overproof_parsed_as_list(client):
    csv = (
        "period,river_name,section_name,current_class,overproof\r\n"
        "2026-07,滠水,滠口,Ⅳ,生化需氧量(0.12)、化学需氧量(0.04)\r\n"
        "2026-07,汉江,宗关,Ⅱ,无\r\n"
    )
    db = SessionLocal()
    batch, rows = imp.preview_import(db, "op.csv", csv.encode("utf-8"))
    imp.confirm_import(db, batch.batch_id)
    import json
    rec = db.query(OfficialMonthlyRecord).filter(
        OfficialMonthlyRecord.batch_id == batch.batch_id,
        OfficialMonthlyRecord.section_name == "滠口",
    ).one()
    assert json.loads(rec.overproof_json) == ["生化需氧量(0.12)", "化学需氧量(0.04)"]
    zongguan = db.query(OfficialMonthlyRecord).filter(
        OfficialMonthlyRecord.batch_id == batch.batch_id,
        OfficialMonthlyRecord.section_name == "宗关",
    ).one()
    assert json.loads(zongguan.overproof_json) == []
    _cleanup(batch.batch_id)
    db.close()


# ---------- API 层 ----------

def test_api_flow_and_permissions(client, token, analyst_token):
    # 演示模式免鉴权：任意访问者均可上传预览（公网部署须恢复管理员鉴权）
    r = client.post(
        "/api/import/official-history",
        headers={"Authorization": f"Bearer {analyst_token}"},
        files={"file": ("m.csv", VALID_CSV.encode("utf-8"), "text/csv")},
    )
    assert r.status_code == 200

    # 未携带 token 同样可用（演示模式）
    assert client.post(
        "/api/import/official-history",
        files={"file": ("m2.csv", VALID_CSV.encode("utf-8"), "text/csv")},
    ).status_code == 200

    # 管理员上传 → 预览
    r = client.post(
        "/api/import/official-history",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("2026-07.csv", VALID_CSV.encode("utf-8"), "text/csv")},
    )
    assert r.status_code == 200
    preview = r.json()
    assert preview["totalRows"] == 3 and preview["validRows"] == 3
    assert preview["status"] == "PREVIEW"
    batch_id = preview["batchId"]

    # 确认
    r = client.post(
        f"/api/import/official-history/{batch_id}/confirm",
        headers={"Authorization": f"Bearer {token}"},
        json={"agency": "武汉市生态环境监控中心"},
    )
    assert r.status_code == 200 and r.json()["status"] == "CONFIRMED"

    # 查询：普通登录用户可读
    r = client.get(
        "/api/official-monthly-records?period=2026-07",
        headers={"Authorization": f"Bearer {analyst_token}"},
    )
    assert r.status_code == 200 and len(r.json()) == 3

    # 撤销
    r = client.post(
        f"/api/import/official-history/{batch_id}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200 and r.json()["status"] == "REVOKED"
