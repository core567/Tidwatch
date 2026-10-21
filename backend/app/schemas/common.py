"""统一错误结构与分页包装（GRP 7.4 / 8.1）。"""
from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import Field

from app.schemas.base import CamelModel

T = TypeVar("T")


class ApiError(CamelModel):
    code: str
    message: str
    details: Any | None = None
    request_id: str | None = None


class PageResult(CamelModel, Generic[T]):
    items: list[T]
    page: int = Field(ge=1, default=1)
    page_size: int = Field(ge=1, default=20)
    total: int = Field(ge=0, default=0)
