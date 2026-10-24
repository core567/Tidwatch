"""证据与假设路由（P04/P06 使用）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.event import ActiveEvent
from app.models.system import User
from app.schemas.research import (
    AddEvidenceIn,
    CreateHypothesisIn,
    EvidenceOut,
    HypothesisOut,
    LinkEvidenceIn,
)
from app.services import evidence_service as svc
import json

router = APIRouter(prefix="/api/events", tags=["research"])


def _require_event(db: Session, event_id: str) -> ActiveEvent:
    event = db.get(ActiveEvent, event_id)
    if event is None:
        raise NotFoundError("活动事件", event_id)
    return event


@router.get("/{event_id}/evidence", response_model=list[EvidenceOut])
def list_evidence(
    event_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    _require_event(db, event_id)
    return [
        EvidenceOut(
            evidenceId=e.evidence_id, eventId=e.event_id, type=e.type,
            sourceRef=e.source_ref, polarity=e.polarity, qualityFlag=e.quality_flag,
            note=e.note, createdBy=e.created_by, observedAt=e.observed_at,
            createdAt=e.created_at,
        )
        for e in svc.list_evidence(db, event_id)
    ]


@router.post("/{event_id}/evidence", response_model=EvidenceOut)
def add_evidence(
    event_id: str,
    body: AddEvidenceIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_event(db, event_id)
    e = svc.add_evidence(
        db, event_id, type=body.type, source_ref=body.source_ref,
        polarity=body.polarity, note=body.note, observed_at=body.observed_at,
        created_by=user.user_id,
    )
    db.commit()
    return EvidenceOut(
        evidenceId=e.evidence_id, eventId=e.event_id, type=e.type,
        sourceRef=e.source_ref, polarity=e.polarity, qualityFlag=e.quality_flag,
        note=e.note, createdBy=e.created_by, observedAt=e.observed_at,
        createdAt=e.created_at,
    )


@router.get("/{event_id}/hypotheses", response_model=list[HypothesisOut])
def list_hypotheses(
    event_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    _require_event(db, event_id)
    return [_hyp_out(h) for h in svc.list_hypotheses(db, event_id)]


@router.post("/{event_id}/hypotheses", response_model=HypothesisOut)
def create_hypothesis(
    event_id: str,
    body: CreateHypothesisIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_event(db, event_id)
    h = svc.create_hypothesis(
        db, event_id, body.statement,
        basis_evidence=body.basis_evidence_ids, created_by=user.user_id,
    )
    db.commit()
    return _hyp_out(h)


@router.post("/hypotheses/{hypothesis_id}/link", response_model=HypothesisOut)
def link_hypothesis(
    hypothesis_id: str,
    body: LinkEvidenceIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    h = svc.link_evidence(db, hypothesis_id, body.polarity, body.evidence_ids, actor=user.user_id)
    db.commit()
    return _hyp_out(h)


def _hyp_out(h) -> HypothesisOut:
    return HypothesisOut(
        hypothesisId=h.hypothesis_id, eventId=h.event_id, statement=h.statement,
        state=h.state,
        supportRefs=json.loads(h.support_refs or "[]"),
        counterRefs=json.loads(h.counter_refs or "[]"),
        createdAt=h.created_at,
    )
