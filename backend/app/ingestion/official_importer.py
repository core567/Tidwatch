"""官方月报导入：解析预览 → 校验 → 确认入库 → 可按批次撤销。

月度水质类别保留原始口径，进入独立的 official_monthly_records 表，
不与连续观测混存、不插值为曲线。
"""
from __future__ import annotations

import io
import json
import re
import uuid
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError, ValidationAppError
from app.models.observation import ImportBatch, OfficialMonthlyRecord
from app.models.reach import Reach

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "period": ("period", "年月", "监测月份", "月份", "报告期"),
    "river_name": ("river_name", "river", "河流名称", "河流", "河流名"),
    "section_name": ("section_name", "section", "监测断面", "断面", "断面名称"),
    "function_class": ("function_class", "功能类别", "功能区类别"),
    "current_class": ("current_class", "水质现状", "现状类别", "水质类别", "现状"),
    "compliance": ("compliance", "达标情况", "是否达标", "达标"),
    "yoy_change": ("yoy_change", "同比变化", "同比"),
    "overproof": ("overproof", "主要超标指标", "超标指标", "超标指标（超标倍数）"),
    "agency": ("agency", "发布机构", "来源机构", "机构"),
    "source_url": ("source_url", "source_url", "原文链接", "来源链接", "url"),
    "published_at": ("published_at", "发布日期", "发布时间"),
}

REQUIRED = ("period", "river_name", "section_name")

WATER_CLASSES = {"Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "劣Ⅴ", "无", "/", ""}
COMPLIANCE_VALUES = {"达标", "不达标", "/", "无", ""}
OVERPROOF_EMPTY = {"无", "/", "", "—", "-"}

_PERIOD_PATTERNS = (
    re.compile(r"^(\d{4})[-/\.](\d{1,2})$"),
    re.compile(r"^(\d{4})年(\d{1,2})月?$"),
)


def _norm_header(h: str) -> str:
    return str(h).strip().replace(" ", "").lower()


def _parse_period(raw: str) -> tuple[str | None, str | None]:
    s = (raw or "").strip()
    for pat in _PERIOD_PATTERNS:
        m = pat.match(s)
        if m:
            y, mo = int(m.group(1)), int(m.group(2))
            if 1 <= mo <= 12:
                return f"{y:04d}-{mo:02d}", None
    return None, f"月份格式无法识别: {raw!r}（期望 YYYY-MM）"


def _split_overproof(raw: str) -> list[str]:
    if (raw or "").strip() in OVERPROOF_EMPTY:
        return []
    parts = re.split(r"[、,，;；\n]+", raw)
    return [p.strip() for p in parts if p.strip() and p.strip() not in OVERPROOF_EMPTY]


def parse_file(filename: str, content: bytes) -> list[dict[str, str]]:
    name = filename.lower()
    try:
        if name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
        elif name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), dtype=str, keep_default_na=False)
        else:
            raise AppError("UNSUPPORTED_FILE", "仅支持 .csv / .xlsx 文件", 422)
    except AppError:
        raise
    except Exception as e:  # pandas/openpyxl 解析错误
        raise AppError("FILE_PARSE_ERROR", f"文件解析失败: {e}", 422) from e
    return [{str(k): ("" if v is None else str(v).strip()) for k, v in row.items()}
            for row in df.to_dict(orient="records")]


def _resolve_columns(rows: list[dict[str, str]]) -> dict[str, str]:
    """返回 标准字段 -> 实际列名。"""
    if not rows:
        raise AppError("EMPTY_FILE", "文件没有数据行", 422)
    headers = {_norm_header(h): h for h in rows[0].keys()}
    resolved: dict[str, str] = {}
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            key = _norm_header(alias)
            if key in headers:
                resolved[field] = headers[key]
                break
    missing = [f for f in REQUIRED if f not in resolved]
    if missing:
        raise AppError("MAPPING_FAILED", f"缺少必需列: {', '.join(missing)}", 422, {"foundColumns": list(rows[0].keys())})
    return resolved


def preview_import(
    db: Session,
    filename: str,
    content: bytes,
    imported_by: str | None = None,
) -> tuple[ImportBatch, list[dict]]:
    rows_raw = parse_file(filename, content)
    columns = _resolve_columns(rows_raw)

    # 候选断面匹配（仅标注候选，不改变坐标核验状态）
    candidates = {r.official_candidate_name: r.reach_id for r in db.query(Reach).all()}

    row_views: list[dict] = []
    periods: set[str] = set()
    agency = url = published_at = None
    seen_keys: set[tuple[str, str, str]] = set()

    for idx, raw_row in enumerate(rows_raw, start=1):
        get = lambda f: raw_row.get(columns[f], "").strip() if f in columns else ""  # noqa: E731
        errors: list[str] = []
        warnings: list[str] = []

        period, perr = _parse_period(get("period"))
        if perr:
            errors.append(perr)
        elif period:
            periods.add(period)

        river, section = get("river_name"), get("section_name")
        if not river:
            errors.append("河流名称为空")
        if not section:
            errors.append("监测断面为空")

        fn_cls, cur_cls = get("function_class"), get("current_class")
        if fn_cls not in WATER_CLASSES:
            warnings.append(f"功能类别非标准取值: {fn_cls!r}，原样保留")
        if cur_cls not in WATER_CLASSES:
            warnings.append(f"水质现状非标准取值: {cur_cls!r}，原样保留")
        compliance = get("compliance")
        if compliance and compliance not in COMPLIANCE_VALUES:
            warnings.append(f"达标情况非标准取值: {compliance!r}")

        overproof = _split_overproof(get("overproof"))
        # 月报用“*”标注入境断面，匹配候选点时去掉该标记，断面名原样保留
        matched = candidates.get(section) or candidates.get(section.rstrip("*").strip())

        key = (period or "", river, section)
        if key in seen_keys:
            errors.append("文件内重复记录（月份+河流+断面相同）")
        seen_keys.add(key)

        agency = agency or get("agency") or None
        url = url or get("source_url") or None
        published_at = published_at or (get("published_at") or None)

        normalized = {
            "period": period,
            "riverName": river,
            "sectionName": section,
            "functionClass": fn_cls or None,
            "currentClass": cur_cls or None,
            "compliance": compliance or None,
            "yoyChange": get("yoy_change") or None,
            "overproof": overproof,
        }
        row_views.append({
            "rowNo": idx,
            "raw": raw_row,
            "normalized": normalized,
            "matchedReachId": matched,
            "errors": errors,
            "warnings": warnings,
        })

    if len(periods) > 1:
        for v in row_views:
            v["warnings"].append(f"文件跨多个月份: {sorted(periods)}")

    batch_id = f"imp-{uuid.uuid4().hex[:16]}"
    period_value = sorted(periods)[0] if len(periods) == 1 else None
    valid = sum(1 for v in row_views if not v["errors"])
    invalid = len(row_views) - valid

    batch = ImportBatch(
        batch_id=batch_id,
        source_kind="OFFICIAL_MONTHLY",
        original_filename=filename,
        agency=agency,
        source_url=url,
        published_period=period_value,
        status="PREVIEW",
        row_count=0,
        validation_report=json.dumps(
            {"columns": columns, "rows": row_views}, ensure_ascii=False
        ),
        imported_by=imported_by,
    )
    db.add(batch)
    db.commit()
    return batch, row_views


def confirm_import(
    db: Session,
    batch_id: str,
    *,
    agency: str | None = None,
    source_url: str | None = None,
    published_at: datetime | None = None,
) -> ImportBatch:
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise NotFoundError("导入批次", batch_id)
    if batch.status == "CONFIRMED":
        raise ConflictError("该批次已确认，请勿重复导入", {"batchId": batch_id})
    if batch.status == "REVOKED":
        raise ConflictError("该批次已撤销，不能再确认")

    report = json.loads(batch.validation_report or "{}")
    rows: list[dict] = report.get("rows", [])
    valid_rows = [r for r in rows if not r["errors"]]
    if not valid_rows:
        raise AppError("NO_VALID_ROWS", "没有可导入的有效行", 422)

    for r in valid_rows:
        n = r["normalized"]
        record = OfficialMonthlyRecord(
            record_id=f"omr-{uuid.uuid4().hex[:16]}",
            batch_id=batch_id,
            period=n["period"],
            river_name=n["riverName"],
            section_name=n["sectionName"],
            function_class=n.get("functionClass"),
            current_class=n.get("currentClass"),
            compliance=n.get("compliance"),
            yoy_change=n.get("yoyChange"),
            overproof_json=json.dumps(n.get("overproof", []), ensure_ascii=False),
            raw_row_json=json.dumps(r["raw"], ensure_ascii=False),
            matched_reach_id=r.get("matchedReachId"),
        )
        db.add(record)

    batch.status = "CONFIRMED"
    batch.row_count = len(valid_rows)
    if agency:
        batch.agency = agency
    if source_url:
        batch.source_url = source_url
    if published_at:
        batch.published_at = published_at
    db.commit()
    return batch


def revoke_batch(db: Session, batch_id: str) -> ImportBatch:
    """按批次撤销：删除该批记录并标记 REVOKED（可追溯，不物理删批次）。"""
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise NotFoundError("导入批次", batch_id)
    if batch.status != "CONFIRMED":
        raise ConflictError("只能撤销已确认的批次", {"status": batch.status})
    db.query(OfficialMonthlyRecord).filter(
        OfficialMonthlyRecord.batch_id == batch_id
    ).delete(synchronize_session=False)
    batch.status = "REVOKED"
    batch.row_count = 0
    db.commit()
    return batch
