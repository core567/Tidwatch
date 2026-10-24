"""测试夹具：内存 SQLite（StaticPool 单连接，无锁）+ 种子用户 + TestClient。"""
from __future__ import annotations

import os

# 必须在导入 app/db 前指定内存库 + StaticPool
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("MQTT_ENABLED", "false")

import pytest  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

_test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(_test_engine, "connect")
def _fk_pragma(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


from fastapi.testclient import TestClient  # noqa: E402

# 替换 app.db.session 的引擎与 Session 工厂（需在导入业务模块前完成）
import app.db.session as _dbsession  # noqa: E402

_dbsession.engine = _test_engine
_dbsession.SessionLocal.configure(bind=_test_engine)

from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.reach import MetricDictionary, Reach  # noqa: E402
from app.models.system import RuleConfig, User  # noqa: E402
from app.rules import DEMO_RULES_V1  # noqa: E402
import json  # noqa: E402


@pytest.fixture(scope="session")
def client():
    Base.metadata.create_all(bind=_test_engine)
    db = SessionLocal()
    db.add(
        User(
            user_id="u-admin",
            username="admin",
            display_name="系统管理员",
            password_hash=hash_password("Admin#2026"),
            role="admin",
            enabled=True,
        )
    )
    db.add(
        User(
            user_id="u-analyst",
            username="analyst",
            display_name="监测分析人员",
            password_hash=hash_password("Analyst#2026"),
            role="analyst",
            enabled=True,
        )
    )
    # 三个逻辑监测点（M1 入库测试依赖）
    for rid, name, role, order, candidate in [
        ("reach-a", "上游 A", "upstream", 1, "新沟"),
        ("reach-b", "中游 B", "midstream", 2, "宗关"),
        ("reach-c", "下游 C", "downstream", 3, "龙王庙"),
    ]:
        db.add(
            Reach(
                reach_id=rid,
                name=name,
                role=role,
                topo_order=order,
                online_status="OFFLINE",
                coordinate_status="LOGICAL",
                official_candidate_name=candidate,
            )
        )
    for key, name, unit, lo, hi, kind in [
        ("waterLevel", "水位", "m", 0, 30, "continuous"),
        ("turbidity", "浊度", "NTU", 0, 1000, "continuous"),
        ("flowLevel", "水流等级", "enum0-3", 0, 3, "ordinal"),
    ]:
        db.add(
            MetricDictionary(
                metric_key=key,
                display_name=name,
                unit=unit,
                min_value=lo,
                max_value=hi,
                data_kind=kind,
            )
        )
    db.add(
        RuleConfig(
            rule_version="demo-rules-v1",
            label="test",
            is_demo=True,
            params_json=json.dumps(DEMO_RULES_V1.to_dict()),
        )
    )
    db.commit()
    db.close()

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def token(client) -> str:
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin#2026"},
    )
    assert resp.status_code == 200
    return resp.json()["accessToken"]


@pytest.fixture(scope="session")
def analyst_token(client) -> str:
    resp = client.post(
        "/api/auth/login",
        json={"username": "analyst", "password": "Analyst#2026"},
    )
    assert resp.status_code == 200
    return resp.json()["accessToken"]


@pytest.fixture()
def clean_event_tables(client):
    """清空事件相关全部表（含证据/评估/盲区/任务），供事件类测试隔离。"""
    from app.models.event import ChangeEvent, EventScope, EventStatusTransition, TemporalRelation
    from app.models.evidence import Evidence, Hypothesis
    from app.models.focus import BlindSpot, ObservationFocus
    from app.models.workflow import Assessment, EventReview, InspectionTask, RunTrace
    from app.models.observation import Attachment, Observation
    from app.models.event import ActiveEvent

    tables = (
        TemporalRelation, ChangeEvent, EventStatusTransition, EventScope,
        Evidence, Hypothesis, Assessment, BlindSpot, ObservationFocus,
        RunTrace, EventReview, InspectionTask, Attachment, Observation, ActiveEvent,
    )
    db = SessionLocal()
    for m in tables:
        db.query(m).delete()
    db.commit()
    db.close()
    yield
    db = SessionLocal()
    for m in tables:
        db.query(m).delete()
    db.commit()
    db.close()
