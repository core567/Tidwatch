"""V2 增量迁移（幂等，可重复执行）。

阶段 C：
  - 建立 business_events 统一审计事件表（CREATE TABLE IF NOT EXISTS）
  - backfill：由 event_status_transitions / run_traces 重建历史时间线，
    标记 source=backfill；已回填的业务键去重，不重复写入。

不改动事件相关表；任务 status 为字符串无 CHECK 约束。
用法（在 backend/ 目录）：
    .venv/Scripts/python.exe scripts/migrate_v2.py
    .venv/Scripts/python.exe scripts/migrate_v2.py --no-backfill   # 只建表
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal, engine  # noqa: E402
from app.models import Base  # noqa: E402
from app.models.audit import BusinessEvent  # noqa: E402
from app.services import timeline_service  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-backfill", action="store_true", help="只建表，不回填历史")
    args = parser.parse_args()

    # 幂等建表（SQLite 下 create_all 默认 CHECK FIRST，等价 IF NOT EXISTS）
    Base.metadata.create_all(bind=engine, tables=[BusinessEvent.__table__])
    print("[migrate_v2] business_events 表已就绪")

    if args.no_backfill:
        return

    db = SessionLocal()
    try:
        stats = timeline_service.backfill(db)
        db.commit()
        print(
            f"[migrate_v2] backfill 完成：事件迁移 {stats['event.status-changed']} 条，"
            f"任务轨迹 {stats['task']} 条，跳过已存在 {stats['skipped']} 条"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
