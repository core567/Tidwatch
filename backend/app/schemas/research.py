"""证据与假设契约。"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

EvidenceType = Literal["OBSERVATION", "RULE", "MANUAL", "EXTERNAL", "MODEL", "KNOWLEDGE"]
Polarity = Literal["SUPPORT", "COUNTER", "MISSING"]
HypothesisState = Literal[
    "OPEN", "PARTIAL_SUPPORT", "SUPPORT", "NOT_SUPPORT", "UNKNOWN"
]


class EvidenceOut(CamelModel):
    evidence_id: str
    event_id: str
    type: EvidenceType
    source_ref: str
    polarity: Polarity
    quality_flag: str | None = None
    note: str | None = None
    created_by: str
    observed_at: datetime | None = None
    created_at: datetime


class AddEvidenceIn(CamelModel):
    type: EvidenceType
    source_ref: str = Field(min_length=1, max_length=256)
    polarity: Polarity
    note: str | None = Field(default=None, max_length=1000)
    observed_at: datetime | None = None


class HypothesisOut(CamelModel):
    hypothesis_id: str
    event_id: str
    statement: str
    state: HypothesisState
    support_refs: list[str] = Field(default_factory=list)
    counter_refs: list[str] = Field(default_factory=list)
    created_at: datetime


class CreateHypothesisIn(CamelModel):
    statement: str = Field(min_length=2, max_length=500)
    basis_evidence_ids: list[str] = Field(default_factory=list)


class LinkEvidenceIn(CamelModel):
    polarity: Polarity
    evidence_ids: list[str] = Field(min_length=1)
