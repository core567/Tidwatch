"""国家地表水自动监测实时数据采集（低频、带缓存、失败降级）。

数据来源：中国环境监测总站「国家地表水水质自动监测实时数据发布系统」
```POST https://szzdjc.cnemc.cn:8070/GJZ/Ajax/Publish.ashx```
参数 `action=getRealDatas&MNName=<断面>&PageIndex=1&PageSize=20`。

约束与口径：
- 平台只发布当前快照、无公开历史序列接口；2026-10-25 实测全站 980 行均为当日
  00:00，即常态为每日一条。本模块只保留最新观测，不插值、不伪造连续趋势。
- 平台含反爬声明。默认关闭（OFFICIAL_AUTO_ENABLED=false），仅在 P12 手动
  「立即拉取」时触发，且同一站点 30 分钟内命中缓存不再请求。
- 采集失败不影响 MQTT 模拟链路与事件机：写入采集日志并降级为"采集失败/过期"。
"""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models.ingestion import IngestionError
from app.models.observation import OfficialAutoFetch, OfficialAutoRecord

logger = get_logger("official_auto")

CST = timezone(timedelta(hours=8))
SOURCE_LABEL = "国家地表水自动监测实时数据发布系统"
RAW_VALUE_RE = re.compile(r"title='原始值[：:]\s*([^']*)'")
TAG_RE = re.compile(r"<[^>]+>")

WATER_CLASS_MAP = {"1": "Ⅰ", "2": "Ⅱ", "3": "Ⅲ", "4": "Ⅳ", "5": "Ⅴ", "6": "劣Ⅴ"}


@dataclass(frozen=True)
class StationBinding:
    """逻辑断面 ↔ 官方自动站。上下游对应关系未经官方确认，标注为示意。"""

    station_name: str
    reach_id: str
    note: str


# 汉江干流国控自动站（实测存在）。站点与逻辑节点分离：未核实经纬度前仅作示意关联。
STATIONS: tuple[StationBinding, ...] = (
    StationBinding("余家湖", "reach-a", "汉江上游（襄阳）代表站，上下游对应待核"),
    StationBinding("转斗", "reach-b", "汉江中游（钟祥）代表站，上下游对应待核"),
    StationBinding("新沟闸", "reach-c", "汉江武汉段代表站，上下游对应待核"),
)

STATION_BY_NAME = {s.station_name: s for s in STATIONS}


def to_utc(value: datetime) -> datetime:
    """SQLite 读回的时间无时区信息，统一按 UTC 处理，避免 naive/aware 混算。"""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _col_index(thead: list[str]) -> dict[str, int]:
    """按表头关键词定位列，避免官方新增指标导致整体错位。"""
    keys = {
        "province": ("省份",),
        "basin": ("流域",),
        "station": ("断面名称", "断面"),
        "observedAt": ("监测时间",),
        "waterClass": ("水质类别",),
        "waterTemp": ("水温",),
        "ph": ("pH",),
        "dissolvedOxygen": ("溶解氧",),
        "conductivity": ("电导率",),
        "turbidity": ("浊度",),
        "codMn": ("高锰酸盐指数",),
        "ammoniaN": ("氨氮",),
        "totalPhosphorus": ("总磷",),
        "totalNitrogen": ("总氮",),
        "chlorophyllA": ("叶绿素",),
        "algaeDensity": ("藻密度",),
    }
    out: dict[str, int] = {}
    for field, words in keys.items():
        for idx, raw in enumerate(thead):
            text = TAG_RE.sub("", str(raw))
            if any(w in text for w in words):
                out[field] = idx
                break
    required = ("station", "observedAt")
    missing = [f for f in required if f not in out]
    if missing:
        raise ValueError(f"官方响应缺少必需列: {', '.join(missing)}")
    return out


def _num(cell: object) -> float | None:
    """单元格 → 数值。优先取 title 中的原始值，`--`/空/非数一律 None。"""
    if cell is None:
        return None
    text = str(cell)
    m = RAW_VALUE_RE.search(text)
    raw = m.group(1) if m else TAG_RE.sub("", text)
    raw = raw.strip()
    if raw in ("", "--", "-", "/", "—"):
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _text(cell: object) -> str | None:
    if cell is None:
        return None
    text = TAG_RE.sub("", str(cell)).strip()
    return text or None


def parse_observed_at(raw: str, now: datetime | None = None) -> datetime:
    """解析 `10-25 00:00`（无年份）。跨年时回退上一年，结果统一转 UTC。"""
    now = now or datetime.now(timezone.utc)
    now_cst = now.astimezone(CST)
    text = TAG_RE.sub("", str(raw)).strip()
    for fmt in ("%m-%d %H:%M", "%Y-%m-%d %H:%M", "%m-%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt)
            break
        except ValueError:
            continue
    else:
        raise ValueError(f"无法解析监测时间: {raw!r}")
    if parsed.year == 1900:
        candidate = parsed.replace(year=now_cst.year, tzinfo=CST)
        # 官方时间不会显著超前；若超前超过 2 天，视为上一年
        if candidate - now_cst > timedelta(days=2):
            candidate = candidate.replace(year=now_cst.year - 1)
    else:
        candidate = parsed.replace(tzinfo=CST)
    return candidate.astimezone(timezone.utc)


def parse_payload(
    payload: dict,
    fetched_at: datetime | None = None,
    source_url: str | None = None,
) -> list[dict]:
    """解析官方响应，只保留已映射的目标站点。"""
    fetched_at = fetched_at or datetime.now(timezone.utc)
    thead = payload.get("thead") or []
    rows = payload.get("tbody") or []
    cols = _col_index([str(x) for x in thead])

    def val(row: list, field: str) -> object | None:
        idx = cols.get(field)
        return row[idx] if idx is not None and idx < len(row) else None

    parsed: list[dict] = []
    for row in rows:
        if not isinstance(row, list):
            continue
        station = _text(val(row, "station"))
        binding = STATION_BY_NAME.get(station or "")
        if binding is None:
            continue
        observed_raw = _text(val(row, "observedAt")) or ""
        try:
            observed_at = parse_observed_at(observed_raw, now=fetched_at)
        except ValueError:
            continue
        water_class = _text(val(row, "waterClass"))
        parsed.append(
            {
                "station_name": binding.station_name,
                "reach_id": binding.reach_id,
                "mapping_status": "UNVERIFIED",
                "province": _text(val(row, "province")),
                "basin": _text(val(row, "basin")),
                "observed_at": observed_at,
                "fetched_at": fetched_at,
                "water_class": WATER_CLASS_MAP.get(water_class or "", water_class),
                "water_temp": _num(val(row, "waterTemp")),
                "ph": _num(val(row, "ph")),
                "dissolved_oxygen": _num(val(row, "dissolvedOxygen")),
                "conductivity": _num(val(row, "conductivity")),
                "turbidity": _num(val(row, "turbidity")),
                "cod_mn": _num(val(row, "codMn")),
                "ammonia_n": _num(val(row, "ammoniaN")),
                "total_phosphorus": _num(val(row, "totalPhosphorus")),
                "total_nitrogen": _num(val(row, "totalNitrogen")),
                "chlorophyll_a": _num(val(row, "chlorophyllA")),
                "algae_density": _num(val(row, "algaeDensity")),
                "source_url": source_url,
                "raw_row_json": json.dumps(row, ensure_ascii=False),
            }
        )
    return parsed


def _ssl_context() -> ssl.SSLContext:
    # 官方站点使用自签名证书，仅读取公开数据；不校验证书但限制只读 GET 语义的 POST 查询
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_station(station_name: str, timeout: int | None = None) -> dict:
    """按断面名查询官方接口（单站一次请求）。"""
    url = settings.official_auto_url
    data = urllib.parse.urlencode(
        {
            "action": "getRealDatas",
            "AreaID": "",
            "RiverID": "",
            "MNName": station_name,
            "PageIndex": 1,
            "PageSize": 20,
        }
    ).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": settings.official_auto_referer,
            "User-Agent": "Mozilla/5.0 (TideWatch teaching demo)",
        },
    )
    timeout = timeout or settings.official_auto_timeout_seconds
    raw = urllib.request.urlopen(req, context=_ssl_context(), timeout=timeout).read()
    payload = json.loads(raw.decode("utf-8"))
    # 节流触发时平台会返回非预期结构（如裸 int），明确失败交由上层降级
    if not isinstance(payload, dict) or "tbody" not in payload:
        raise ValueError("官方接口返回非预期结构")
    return payload


def _record_id(station: str, observed_at: datetime) -> str:
    key = f"{station}|{observed_at.astimezone(timezone.utc).isoformat()}"
    return "auto-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:18]


def _last_success(db: Session) -> OfficialAutoFetch | None:
    return db.execute(
        select(OfficialAutoFetch)
        .where(OfficialAutoFetch.ok.is_(True))
        .order_by(OfficialAutoFetch.fetched_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _log_fetch(
    db: Session,
    *,
    started: datetime,
    ok: bool,
    station_count: int,
    record_count: int,
    duration_ms: int,
    message: str | None = None,
) -> OfficialAutoFetch:
    entry = OfficialAutoFetch(
        fetch_id=f"oaf-{uuid.uuid4().hex[:12]}",
        fetched_at=started,
        ok=ok,
        station_count=station_count,
        record_count=record_count,
        duration_ms=duration_ms,
        message=message,
    )
    db.add(entry)
    return entry


def _upsert(db: Session, rows: list[dict]) -> tuple[int, int]:
    inserted = skipped = 0
    for row in rows:
        existing = db.execute(
            select(OfficialAutoRecord.record_id).where(
                and_(
                    OfficialAutoRecord.station_name == row["station_name"],
                    OfficialAutoRecord.observed_at == row["observed_at"],
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            skipped += 1
            continue
        db.add(
            OfficialAutoRecord(
                record_id=_record_id(row["station_name"], row["observed_at"]),
                **row,
            )
        )
        inserted += 1
    return inserted, skipped


def sync(
    db: Session,
    *,
    force: bool = False,
    fetcher=None,
    now: datetime | None = None,
) -> dict:
    """拉取并入库一次。命中缓存直接返回；失败只记录日志，不抛出。"""
    fetcher = fetcher or fetch_station
    now = now or datetime.now(timezone.utc)
    if not settings.official_auto_enabled and not force:
        return {"ok": False, "skipped": True, "reason": "DISABLED", "fetchedAt": now.isoformat()}

    last = _last_success(db)
    if not force and last is not None:
        age = now - to_utc(last.fetched_at)
        if age < timedelta(minutes=settings.official_auto_cache_minutes):
            return {
                "ok": True,
                "skipped": True,
                "reason": "CACHE",
                "fetchedAt": to_utc(last.fetched_at).isoformat(),
                "nextAllowedAt": (
                    to_utc(last.fetched_at)
                    + timedelta(minutes=settings.official_auto_cache_minutes)
                ).isoformat(),
            }

    started = time.monotonic()
    errors: list[str] = []
    rows: list[dict] = []
    station_ok = 0
    for idx, binding in enumerate(STATIONS):
        if idx and settings.official_auto_request_interval_seconds > 0:
            time.sleep(settings.official_auto_request_interval_seconds)
        try:
            payload = fetcher(binding.station_name)
            if not isinstance(payload, dict) or "tbody" not in payload:
                # 平台反爬偶发结构异常，退避后重试一次
                time.sleep(settings.official_auto_retry_delay_seconds)
                payload = fetcher(binding.station_name)
            if not isinstance(payload, dict) or "tbody" not in payload:
                raise ValueError("官方接口返回非预期结构")
            parsed = parse_payload(
                payload, fetched_at=now, source_url=settings.official_auto_url
            )
            if not parsed:
                errors.append(f"{binding.station_name}: 响应中未找到该断面")
                continue
            rows.extend(parsed)
            station_ok += 1
        except Exception as exc:  # noqa: BLE001 网络/解析异常统一降级
            logger.warning("official auto fetch failed", extra={"station": binding.station_name})
            errors.append(f"{binding.station_name}: {type(exc).__name__}")

    inserted, skipped = _upsert(db, rows)
    ok = station_ok > 0
    elapsed = int((time.monotonic() - started) * 1000)
    _log_fetch(
        db,
        started=now,
        ok=ok,
        station_count=station_ok,
        record_count=inserted,
        duration_ms=elapsed,
        message=None if not errors else "; ".join(errors)[:500],
    )
    if not ok:
        db.add(
            IngestionError(
                source="OFFICIAL_AUTO",
                topic=None,
                raw_payload=None,
                reason="官方实时数据采集失败",
                detail="; ".join(errors)[:500],
            )
        )
    db.commit()
    return {
        "ok": ok,
        "skipped": False,
        "fetchedAt": now.isoformat(),
        "stationsOk": station_ok,
        "stationsTotal": len(STATIONS),
        "recordsInserted": inserted,
        "recordsSkipped": skipped,
        "errors": errors,
    }


def latest_records(db: Session, reach_id: str | None = None) -> list[OfficialAutoRecord]:
    """每个已映射站点取最新一条记录。"""
    stations = [s.station_name for s in STATIONS]
    if reach_id:
        stations = [s.station_name for s in STATIONS if s.reach_id == reach_id]
        if not stations:
            return []
    subq = (
        select(
            OfficialAutoRecord.station_name,
            func.max(OfficialAutoRecord.observed_at).label("mx"),
        )
        .where(OfficialAutoRecord.station_name.in_(stations))
        .group_by(OfficialAutoRecord.station_name)
        .subquery()
    )
    rows = db.execute(
        select(OfficialAutoRecord)
        .join(
            subq,
            and_(
                OfficialAutoRecord.station_name == subq.c.station_name,
                OfficialAutoRecord.observed_at == subq.c.mx,
            ),
        )
        .order_by(OfficialAutoRecord.station_name)
    ).scalars()
    return list(rows)


def latest_fetch(db: Session) -> OfficialAutoFetch | None:
    return db.execute(
        select(OfficialAutoFetch).order_by(OfficialAutoFetch.fetched_at.desc()).limit(1)
    ).scalar_one_or_none()


def data_state(record: OfficialAutoRecord | None, now: datetime | None = None) -> str:
    if record is None:
        return "NO_DATA"
    now = now or datetime.now(timezone.utc)
    if now - to_utc(record.observed_at) > timedelta(
        minutes=settings.official_auto_stale_minutes
    ):
        return "STALE"
    return "LIVE"


def age_minutes(record: OfficialAutoRecord | None, now: datetime | None = None) -> int | None:
    if record is None:
        return None
    now = now or datetime.now(timezone.utc)
    return max(0, int((now - to_utc(record.observed_at)).total_seconds() // 60))
