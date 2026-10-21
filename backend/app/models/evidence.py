"""证据与假设。证据不可无来源；假设结论强度不得超过证据。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, utc_now


class Evidence(Base, TimestampMixin):
    __tablename__ = "evidences"

    evidence_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("active_events.event_id"), index=True
    )
    type: Mapped[str] = mapped_column(String(24))  # OBSERVATION/EXTERNAL/RULE/MODEL/MANUAL/KNOWLEDGE
    source_ref: Mapped[str] = mapped_column(String(512))  # observationId / url / traceId
    polarity: Mapped[str] = mapped_column(String(16))  # SUPPORT / COUNTER / MISSING
    quality_flag: Mapped[str | None] = mapped_column(String(16), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), default="SYSTEM")
    observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Hypothesis(Base, TimestampMixin):
    __tablename__ = "hypotheses"

    hypothesis_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("active_events.event_id"), index=True
    )
    statement: Mapped[str] = mapped_column(Text)
    support_refs: Mapped[str] = mapped_column(Text, default="[]")  # JSON evidence ids
    counter_refs: Mapped[str] = mapped_column(Text, default="[]")
    state: Mapped[str] = mapped_column(String(24), default="OPEN")
    # OPEN / PARTIAL_SUPPORT / SUPPORT / NOT_SUPPORT / UNKNOWN
    run_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    latest_evidence_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
