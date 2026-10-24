"""场景控制台服务与路由测试。"""
from __future__ import annotations

import time

import pytest

from app.core.errors import AppError, ConflictError
from app.services import scenario_runner


def test_invalid_scenario_rejected():
    with pytest.raises(AppError):
        scenario_runner.start("S9", 1)


def test_start_and_wait_finishes():
    # S1 固定 30 tick，speed 高时很快结束；这里用 status 轮询
    scenario_runner.start("S1", 50)
    assert scenario_runner.is_running()
    deadline = time.time() + 30
    while scenario_runner.is_running() and time.time() < deadline:
        time.sleep(0.3)
    st = scenario_runner.status()
    assert st["running"] is False
    assert st["scenario"] == "S1"
    assert st["returncode"] == 0
    assert len(st["stdoutTail"]) >= 0


def test_cannot_start_two_concurrent(monkeypatch):
    """已有运行态时拒绝启动（用假进程避免时序不稳定）。"""
    from app.services import scenario_runner

    class FakeProc:
        @staticmethod
        def poll():
            return None  # 仍在运行

        def kill(self):
            pass

        def wait(self, timeout=None):
            pass

    fake = scenario_runner.ScenarioRun(scenario="S1", speed=1, _proc=FakeProc())  # type: ignore[arg-type]
    monkeypatch.setattr(scenario_runner, "_current", fake)
    try:
        with pytest.raises(ConflictError):
            scenario_runner.start("S2", 1)
    finally:
        monkeypatch.setattr(scenario_runner, "_current", None)


def test_admin_only_endpoint(client, token, analyst_token):
    # analyst 无权启动
    r = client.post(
        "/api/admin/scenarios/start",
        headers={"Authorization": f"Bearer {analyst_token}"},
        json={"scenario": "S1", "speed": 10},
    )
    assert r.status_code == 403
    # admin 可查状态
    r2 = client.get(
        "/api/admin/scenarios/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200
    assert "running" in r2.json()
