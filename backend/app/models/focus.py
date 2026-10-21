"""观察重点与监测盲区。无数据不能当作稳定证据。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, utc_now


class ObservationFocus(Base, TimestampMixin):
    __tablename__ = "observation_focuses"

    focus_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("active_events.event_id"), index=True
    )
    reach_id: Mapped[str] = mapped_column(String(32), index=True)
    metric: Mapped[str | None] = mapped_column(String(48), nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")  # ACTIVE/RESOLVED
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BlindSpot(Base, TimestampMixin):
    __tablename__ = "blind_spots"

    blind_spot_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    event_id: Mapped[str | None] = mapped_column(
        ForeignKey("active_events.event_id"), nullable=True, index=True
    )
    reach_id: Mapped[str] = mapped_column(String(32), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    end_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reason: Mapped[str] = mapped_column(String(32))  # LINK_DOWN / STALE
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
