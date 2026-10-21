"""证据、假设、观察重点、盲区契约。"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.base import CamelModel

EvidenceType = Literal["OBSERVATION", "EXTERNAL", "RULE", "MODEL", "MANUAL", "KNOWLEDGE"]
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


class HypothesisOut(CamelModel):
    hypothesis_id: str
    event_id: str
    statement: str
    support_refs: list[str]
    counter_refs: list[str]
    state: HypothesisState
    latest_evidence_at: datetime | None = None


class ObservationFocusOut(CamelModel):
    focus_id: str
    event_id: str
    reach_id: str
    metric: str | None = None
    window_end: datetime | None = None
    reason: str
    status: str  # ACTIVE / RESOLVED
    created_at: datetime


class BlindSpotOut(CamelModel):
    blind_spot_id: str
    event_id: str | None = None
    reach_id: str
    start_at: datetime
    end_at: datetime | None = None
    reason: str  # LINK_DOWN / STALE
    impact: str | None = None
    resolution: str | None = None
