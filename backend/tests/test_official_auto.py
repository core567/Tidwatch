"""官方自动监测实时水质：解析、缓存、失败降级与只读接口（离线 fixture）。"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core.config import settings
from app.db.session import SessionLocal
from app.ingestion import official_auto
from app.models.ingestion import IngestionError
from app.models.observation import OfficialAutoFetch, OfficialAutoRecord

FIXTURE = Path(__file__).parent / "fixtures" / "cnemc_real_sample.json"


@pytest.fixture()
def payload() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture()
def clean_auto(client):
    # 依赖 session 级 client 夹具以建表（本文件其余用例不直接用 TestClient）
    db = SessionLocal()
    db.query(OfficialAutoRecord).delete()
    db.query(OfficialAutoFetch).delete()
    db.query(IngestionError).filter(IngestionError.source == "OFFICIAL_AUTO").delete()
    db.commit()
    db.close()
    yield
    db = SessionLocal()
    db.query(OfficialAutoRecord).delete()
    db.query(OfficialAutoFetch).delete()
    db.query(IngestionError).filter(IngestionError.source == "OFFICIAL_AUTO").delete()
    db.commit()
    db.close()


def test_parse_fixture_maps_only_target_stations(payload):
    fetched_at = datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc)
    rows = official_auto.parse_payload(payload, fetched_at=fetched_at)
    by_name = {r["station_name"]: r for r in rows}
    assert set(by_name) == {"余家湖", "转斗", "新沟闸"}

    xingou = by_name["新沟闸"]
    assert xingou["reach_id"] == "reach-c"
    assert xingou["mapping_status"] == "UNVERIFIED"
    assert xingou["water_class"] == "Ⅳ"
    # 取 title 中的原始值（比展示值精度高）
    assert xingou["water_temp"] == pytest.approx(19.82)
    assert xingou["ph"] == pytest.approx(7.38)
    assert xingou["dissolved_oxygen"] == pytest.approx(3.95)
    assert xingou["ammonia_n"] == pytest.approx(0.588)
    assert xingou["turbidity"] == pytest.approx(24.69)
    # 官方缺测统一为 None，交给前端显示"暂无数据"
    assert xingou["chlorophyll_a"] is None
    assert xingou["algae_density"] is None
    # 10-25 00:00 CST → 10-24 16:00 UTC
    assert xingou["observed_at"] == datetime(2026, 10, 24, 16, 0, tzinfo=timezone.utc)


def test_parse_ignores_unmapped_stations(payload):
    rows = official_auto.parse_payload(payload)
    assert len(rows) == 3
    assert all(r["station_name"] in official_auto.STATION_BY_NAME for r in rows)


def test_value_parsing_prefers_raw_title():
    assert official_auto._num("<span title='原始值：0.030'>0.03</span>") == pytest.approx(0.03)
    assert official_auto._num("--") is None
    assert official_auto._num("") is None
    assert official_auto._num("<span title='原始值：7.47'>7.47</span>") == pytest.approx(7.47)


def test_observed_at_year_rollover():
    now = datetime(2027, 1, 1, 0, 30, tzinfo=timezone.utc)  # CST 2027-01-01 08:30
    got = official_auto.parse_observed_at("12-31 23:00", now=now)
    assert got == datetime(2026, 12, 31, 15, 0, tzinfo=timezone.utc)


def test_sync_inserts_then_uses_cache(clean_auto, payload, monkeypatch):
    monkeypatch.setattr(settings, "official_auto_enabled", True)
    monkeypatch.setattr(settings, "official_auto_request_interval_seconds", 0)
    calls = []

    def fetcher(station: str) -> dict:
        calls.append(station)
        # 单站查询响应只保留目标站点行，模拟真实接口行为
        rows = [r for r in payload["tbody"] if r[2] == station]
        return {"thead": payload["thead"], "tbody": rows}

    db = SessionLocal()
    try:
        now = datetime(2026, 10, 25, 1, 0, tzinfo=timezone.utc)
        first = official_auto.sync(db, fetcher=fetcher, now=now)
        assert first["ok"] and not first["skipped"]
        assert first["recordsInserted"] == 3
        assert sorted(calls) == sorted(s.station_name for s in official_auto.STATIONS)

        calls.clear()
        second = official_auto.sync(db, fetcher=fetcher, now=now + timedelta(minutes=10))
        assert second["skipped"] and second["reason"] == "CACHE"
        assert calls == []

        third = official_auto.sync(
            db, fetcher=fetcher, force=True, now=now + timedelta(minutes=40)
        )
        assert third["recordsInserted"] == 0
        assert third["recordsSkipped"] == 3
        assert db.query(OfficialAutoRecord).count() == 3
    finally:
        db.close()


def test_sync_disabled_without_force(clean_auto, monkeypatch):
    monkeypatch.setattr(settings, "official_auto_enabled", False)
    db = SessionLocal()
    try:
        result = official_auto.sync(db, fetcher=lambda _s: {})
        assert result["skipped"] and result["reason"] == "DISABLED"
    finally:
        db.close()


def test_sync_retries_unexpected_structure(clean_auto, payload, monkeypatch):
    monkeypatch.setattr(settings, "official_auto_enabled", True)
    monkeypatch.setattr(settings, "official_auto_request_interval_seconds", 0)
    monkeypatch.setattr(settings, "official_auto_retry_delay_seconds", 0)
    state = {"first": True}

    def flaky(station: str) -> dict:
        if state["first"]:
            state["first"] = False
            return 1  # 平台反爬偶发返回裸 int
        rows = [r for r in payload["tbody"] if r[2] == station]
        return {"thead": payload["thead"], "tbody": rows}

    db = SessionLocal()
    try:
        result = official_auto.sync(db, fetcher=flaky, force=True)
        assert result["ok"] is True
        assert result["recordsInserted"] == 3
    finally:
        db.close()


def test_sync_failure_degrades_without_raising(clean_auto, monkeypatch):
    monkeypatch.setattr(settings, "official_auto_enabled", True)
    monkeypatch.setattr(settings, "official_auto_request_interval_seconds", 0)

    def broken(_station: str) -> dict:
        raise ConnectionError("network down")

    db = SessionLocal()
    try:
        result = official_auto.sync(db, fetcher=broken, force=True)
        assert result["ok"] is False
        assert result["stationsOk"] == 0
        assert len(result["errors"]) == 3
        entry = db.query(OfficialAutoFetch).one()
        assert entry.ok is False and "ConnectionError" in (entry.message or "")
        assert (
            db.query(IngestionError)
            .filter(IngestionError.source == "OFFICIAL_AUTO")
            .count()
            == 1
        )
    finally:
        db.close()


def test_data_state_and_age(clean_auto):
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        fresh = OfficialAutoRecord(
            record_id="auto-test-fresh",
            station_name="新沟闸",
            observed_at=now - timedelta(minutes=20),
            fetched_at=now,
            reach_id="reach-c",
            raw_row_json="[]",
        )
        stale = OfficialAutoRecord(
            record_id="auto-test-stale",
            station_name="转斗",
            observed_at=now - timedelta(minutes=1600),
            fetched_at=now,
            reach_id="reach-b",
            raw_row_json="[]",
        )
        db.add_all([fresh, stale])
        db.commit()
        assert official_auto.data_state(fresh, now) == "LIVE"
        assert official_auto.data_state(stale, now) == "STALE"
        assert official_auto.data_state(None, now) == "NO_DATA"
        assert official_auto.age_minutes(fresh, now) == 20
    finally:
        db.close()


def test_latest_api_and_status(client, clean_auto):
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        db.add(
            OfficialAutoRecord(
                record_id="auto-test-api",
                station_name="新沟闸",
                province="湖北省",
                basin="长江流域",
                observed_at=now,
                fetched_at=now,
                water_class="Ⅳ",
                dissolved_oxygen=3.95,
                ammonia_n=0.588,
                reach_id="reach-c",
                raw_row_json="[]",
            )
        )
        db.add(
            OfficialAutoFetch(
                fetch_id="oaf-test-api",
                fetched_at=now,
                ok=True,
                station_count=1,
                record_count=1,
                duration_ms=120,
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/official/auto")
    assert resp.status_code == 200
    items = resp.json()
    assert {i["reachId"] for i in items} == {"reach-a", "reach-b", "reach-c"}
    by_reach = {i["reachId"]: i for i in items}
    assert by_reach["reach-a"]["dataState"] == "NO_DATA"
    assert by_reach["reach-a"]["stationName"] == "余家湖"
    c = by_reach["reach-c"]
    assert c["dataState"] == "LIVE"
    assert c["records"][0]["stationName"] == "新沟闸"
    assert c["records"][0]["dissolvedOxygen"] == pytest.approx(3.95)
    assert c["records"][0]["sourceLabel"] == official_auto.SOURCE_LABEL
    assert c["mappingNote"]

    only_c = client.get("/api/official/auto", params={"reachId": "reach-c"}).json()
    assert len(only_c) == 1 and only_c[0]["reachId"] == "reach-c"

    status = client.get("/api/official/auto/status").json()
    assert status["enabled"] is settings.official_auto_enabled
    assert status["cacheMinutes"] == settings.official_auto_cache_minutes
    assert len(status["stations"]) == 3
    assert status["lastFetch"] is not None


def test_refresh_disabled_reports_skip(client, clean_auto, monkeypatch):
    monkeypatch.setattr(settings, "official_auto_enabled", False)
    resp = client.post("/api/official/auto/refresh")
    assert resp.status_code == 200
    body = resp.json()
    assert body["skipped"] is True and body["reason"] == "DISABLED"
