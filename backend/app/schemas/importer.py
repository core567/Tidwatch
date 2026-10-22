"""官方月报导入契约。"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


class MonthlyRecordOut(CamelModel):
    record_id: str
    batch_id: str
    period: str  # YYYY-MM
    river_name: str
    section_name: str
    function_class: str | None = None
    current_class: str | None = None
    compliance: str | None = None
    yoy_change: str | None = None
    overproof: list[str] = Field(default_factory=list)
    matched_reach_id: str | None = None


class ImportRowView(CamelModel):
    row_no: int
    raw: dict[str, str]
    normalized: dict[str, str | list[str] | None]
    matched_reach_id: str | None = None
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @property
    def valid(self) -> bool:
        return not self.errors


class PreviewOut(CamelModel):
    batch_id: str
    source_kind: str
    original_filename: str
    agency: str | None = None
    source_url: str | None = None
    published_period: str | None = None
    published_at: datetime | None = None
    status: str  # PREVIEW
    total_rows: int
    valid_rows: int
    invalid_rows: int
    rows: list[ImportRowView]


class ConfirmIn(CamelModel):
    """确认时仍可修正批次元信息。"""
    agency: str | None = None
    source_url: str | None = None
    published_at: datetime | None = None


class BatchOut(CamelModel):
    batch_id: str
    source_kind: str
    original_filename: str
    agency: str | None = None
    source_url: str | None = None
    published_period: str | None = None
    published_at: datetime | None = None
    status: Literal["PREVIEW", "CONFIRMED", "REVOKED"]
    row_count: int
    imported_by: str | None = None
    created_at: datetime
