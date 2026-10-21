"""Pydantic 契约基类：JSON 字段统一 camelCase（GRP 7.4）。"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,  # 后端内部可用 snake_case 构造
        extra="forbid",
    )
