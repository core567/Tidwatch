"""场景控制台服务（P12）。

以子进程方式运行 simulator/run_scenario.py，数据仍经真实 MQTT 链路
进入后端（不绕过校验/事件/盲区逻辑）。仅管理员可调用；同一时刻只允许一个场景运行。
"""
from __future__ import annotations

import subprocess
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path

from app.core.errors import AppError, ConflictError

BACKEND = Path(__file__).resolve().parents[2]
SIMULATOR = BACKEND.parent / "simulator"
PY = BACKEND / ".venv" / "Scripts" / "python.exe"
if not PY.exists():  # 非 Windows 回退
    PY = Path("python")


@dataclass
class ScenarioRun:
    scenario: str
    speed: int
    returncode: int | None = None
    stdout_tail: str = ""
    started_at: str = ""
    finished_at: str | None = None
    log_path: str | None = None
    _log_file: object = field(default=None, repr=False)
    _proc: subprocess.Popen | None = field(default=None, repr=False)


_lock = threading.RLock()  # 可重入：start() 持锁时 is_running() 也要读状态
_current: ScenarioRun | None = None
_last: ScenarioRun | None = None
VALID = {"S1", "S2", "S3", "S4", "S5"}


def is_running() -> bool:
    with _lock:
        return _current is not None and _current._proc is not None and _current._proc.poll() is None


def start(scenario: str, speed: int = 6) -> ScenarioRun:
    if scenario not in VALID:
        raise AppError("BAD_SCENARIO", f"未知场景: {scenario}", 422)
    with _lock:
        global _current
        if is_running():
            raise ConflictError("已有场景正在运行", {"scenario": _current.scenario})
        run = ScenarioRun(scenario=scenario, speed=speed)
        # Windows 下 stdout PIPE 缓冲写满会导致子进程死锁，输出重定向到临时文件
        log = tempfile.NamedTemporaryFile(
            mode="w+b", suffix=".log", prefix="scenario-", delete=False
        )
        log.close()
        run.log_path = log.name
        fh = open(log.name, "wb")
        run._log_file = fh  # 保持句柄引用，避免被 GC 关闭导致子进程写失败
        proc = subprocess.Popen(
            [str(PY), "run_scenario.py", "--scenario", scenario, "--speed", str(speed)],
            cwd=SIMULATOR, stdout=fh, stderr=subprocess.STDOUT,
        )
        run._proc = proc
        from datetime import datetime, timezone
        run.started_at = datetime.now(timezone.utc).isoformat()
        _current = run

    threading.Thread(target=_wait, args=(run,), daemon=True).start()
    return run


def _wait(run: ScenarioRun) -> None:
    proc = run._proc
    if proc is None:
        return
    rc = proc.wait()
    from datetime import datetime, timezone
    tail = ""
    if run.log_path:
        try:
            tail = Path(run.log_path).read_text(encoding="utf-8", errors="replace")[-1500:]
        except OSError:
            tail = ""
    if run._log_file is not None:
        try:
            run._log_file.close()
        except OSError:
            pass
    with _lock:
        global _current
        run.returncode = rc
        run.stdout_tail = tail
        run.finished_at = datetime.now(timezone.utc).isoformat()
        global _last
        _last = run
        if _current is run:
            _current = None


def stop() -> bool:
    """停止当前运行（只终止发布器进程，不使用进程树以免误杀调用方）。"""
    with _lock:
        global _current
        if _current is None or _current._proc is None:
            return False
        proc = _current._proc
    if proc.poll() is None:
        proc.kill()
        try:
            proc.wait(timeout=5)
        except Exception:
            pass
    return True


def status() -> dict:
    with _lock:
        r = _current or _last
        if r is None:
            return {"running": False, "scenario": None}
        proc = r._proc
        running = _current is not None and proc is not None and proc.poll() is None
        return {
            "running": running,
            "scenario": r.scenario,
            "speed": r.speed,
            "startedAt": r.started_at,
            "finishedAt": r.finished_at,
            "returncode": r.returncode,
            "stdoutTail": r.stdout_tail if not running else "",
        }
