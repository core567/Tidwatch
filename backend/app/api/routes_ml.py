"""规则 vs ML 对照路由（P06）。模型独立建议，不驱动状态机。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.observation import Observation
from app.models.reach import Reach
from app.models.system import ModelOutput, User
from app.rules.thresholds import EnvStatus, classify_environment
from app.services import ml_service

router = APIRouter(prefix="/api/ml", tags=["ml"])


def _latest(db: Session, reach_id: str, metric: str) -> float | None:
    return db.execute(
        select(Observation.value)
        .where(Observation.reach_id == reach_id, Observation.metric == metric)
        .order_by(Observation.observed_at.desc(), Observation.ingested_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _rule_status(wl, tu) -> str | None:
    if wl is None or tu is None:
        return None
    return classify_environment(wl, tu).value


@router.get("/comparison")
def rule_vs_ml(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """对全部断面返回规则判定与 IsolationForest 评分的对照。"""
    reaches = db.execute(select(Reach).order_by(Reach.topo_order)).scalars()
    result = []
    for r in reaches:
        wl = _latest(db, r.reach_id, "waterLevel")
        tu = _latest(db, r.reach_id, "turbidity")
        rule_status = _rule_status(wl, tu)
        result.append(
            ml_service.compare_rule_and_ml(db, r.reach_id, wl, tu, rule_status)
        )
    return {"items": result, "model": ml_service.MODEL_NAME}


@router.get("/outputs")
def model_outputs(
    reachId: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    q = db.query(ModelOutput)
    if reachId:
        q = q.filter(ModelOutput.reach_id == reachId)
    rows = q.order_by(ModelOutput.inferred_at.desc()).limit(limit).all()
    return {
        "items": [
            {
                "outputId": o.output_id,
                "modelVersion": o.model_version,
                "reachId": o.reach_id,
                "output": o.output,
                "score": o.score,
                "features": o.features_json,
                "inferredAt": o.inferred_at.isoformat() if o.inferred_at else None,
            }
            for o in rows
        ]
    }
