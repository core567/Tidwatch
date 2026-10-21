"""种子数据：用户、逻辑监测点、指标字典、演示规则版本。

幂等：已存在的主键跳过或更新，不产生重复数据。
用法（backend/ 目录）：
    .venv/Scripts/python.exe scripts/init_db.py
    .venv/Scripts/python.exe scripts/seed_data.py
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.logging import configure_logging, get_logger  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.reach import MetricDictionary, Reach  # noqa: E402
from app.models.system import RuleConfig, User  # noqa: E402
from app.rules import DEMO_RULES_V1  # noqa: E402

# 开发期种子账号（README 必须写明；生产部署须改密码）
SEED_USERS = [
    ("u-admin", "admin", "系统管理员", "admin", "Admin#2026"),
    ("u-analyst", "analyst", "监测分析人员", "analyst", "Analyst#2026"),
    ("u-inspector", "inspector", "巡检人员", "inspector", "Inspector#2026"),
]

SEED_REACHES = [
    Reach(
        reach_id="reach-a",
        name="上游 A",
        role="upstream",
        topo_order=1,
        online_status="OFFLINE",
        coordinate_status="LOGICAL",
        official_candidate_name="新沟",
        metadata_json=json.dumps(
            {"note": "逻辑演示点；官方月报入境断面候选，坐标与上下游待核实", "topology": "示意拓扑"}
        ),
    ),
    Reach(
        reach_id="reach-b",
        name="中游 B",
        role="midstream",
        topo_order=2,
        online_status="OFFLINE",
        coordinate_status="LOGICAL",
        official_candidate_name="宗关",
        metadata_json=json.dumps(
            {"note": "逻辑演示点；官方月报断面候选，坐标与上下游待核实", "topology": "示意拓扑"}
        ),
    ),
    Reach(
        reach_id="reach-c",
        name="下游 C",
        role="downstream",
        topo_order=3,
        online_status="OFFLINE",
        coordinate_status="LOGICAL",
        official_candidate_name="龙王庙",
        metadata_json=json.dumps(
            {"note": "逻辑演示点；官方月报断面候选（汉江口），坐标与上下游待核实", "topology": "示意拓扑"}
        ),
    ),
]

SEED_METRICS = [
    MetricDictionary(
        metric_key="waterLevel",
        display_name="水位",
        unit="m",
        min_value=0,
        max_value=30,
        data_kind="continuous",
    ),
    MetricDictionary(
        metric_key="turbidity",
        display_name="浊度",
        unit="NTU",
        min_value=0,
        max_value=1000,
        data_kind="continuous",
    ),
    MetricDictionary(
        metric_key="flowLevel",
        display_name="水流等级",
        unit="enum0-3",
        min_value=0,
        max_value=3,
        data_kind="ordinal",
    ),
]


def seed() -> dict[str, int]:
    configure_logging()
    logger = get_logger("seed")
    db = SessionLocal()
    counts = {"users": 0, "reaches": 0, "metrics": 0, "rules": 0}
    try:
        # 用户
        for uid, username, display, role, password in SEED_USERS:
            if db.get(User, uid) is None:
                db.add(
                    User(
                        user_id=uid,
                        username=username,
                        display_name=display,
                        role=role,
                        password_hash=hash_password(password),
                        enabled=True,
                    )
                )
                counts["users"] += 1
        db.flush()

        # 监测点
        for reach in SEED_REACHES:
            if db.get(Reach, reach.reach_id) is None:
                db.add(reach)
                counts["reaches"] += 1
        db.flush()

        # 指标字典
        for metric in SEED_METRICS:
            if db.get(MetricDictionary, metric.metric_key) is None:
                db.add(metric)
                counts["metrics"] += 1
        db.flush()

        # 规则版本（教学阈值，与官方标准分开）
        if db.get(RuleConfig, settings.rule_version) is None:
            db.add(
                RuleConfig(
                    rule_version=settings.rule_version,
                    label="教学演示判级规则（水位 8.5/7.0，浊度 60），非官方标准",
                    is_demo=True,
                    params_json=json.dumps(DEMO_RULES_V1.to_dict(), ensure_ascii=False),
                    enabled=True,
                )
            )
            counts["rules"] += 1

        db.commit()
        logger.info("seed done: %s (db=%s)", counts, settings.resolved_database_url)
        logger.info("seed accounts: admin / analyst / inspector (see README for passwords)")
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# 供其他脚本以编程方式生成稳定 ID
def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


if __name__ == "__main__":
    seed()
