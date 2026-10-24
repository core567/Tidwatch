"""场景控制台路由（P12，仅管理员）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.routes_import import require_admin
from app.models.system import User
from app.services import scenario_runner

router = APIRouter(prefix="/api/admin/scenarios", tags=["scenario-console"])


class StartIn(BaseModel):
    scenario: str = Field(pattern="^(S1|S2|S3|S4|S5)$")
    speed: int = Field(default=6, ge=1, le=100)


@router.get("/status")
def scenario_status(_admin: User = Depends(require_admin)):
    return scenario_runner.status()


@router.post("/start")
def start_scenario(body: StartIn, _admin: User = Depends(require_admin)):
    scenario_runner.start(body.scenario, body.speed)
    return {"started": body.scenario, "speed": body.speed}


@router.post("/stop")
def stop_scenario(_admin: User = Depends(require_admin)):
    stopped = scenario_runner.stop()
    return {"stopped": stopped}
