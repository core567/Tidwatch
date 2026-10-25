"""V2 增量迁移（幂等，可重复执行）。

阶段 C：
  - 建立 business_events 统一审计事件表（CREATE TABLE IF NOT EXISTS）
  - backfill：由 event_status_transitions / run_traces 重建历史时间线。

阶段 E：
  - 建立 task_submissions / task_reviews（CREATE TABLE IF NOT EXISTS）
  - 为迁移前已 SUBMITTED/APPROVED 但无 submission 行的旧任务补一条 v1
    （幂等：已有任意 submission 的任务跳过），保证旧任务也有版本可复核、可看照片。

不改动事件相关表；任务 status 为字符串无 CHECK 约束。
用法（在 backend/ 目录）：
    .venv/Scripts/python.exe scripts/migrate_v2.py
    .venv/Scripts/python.exe scripts/migrate_v2.py --no-backfill   # 只建表
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal, engine  # noqa: E402
from app.models import Base  # noqa: E402
from app.models.audit import BusinessEvent  # noqa: E402
from app.models.workflow import InspectionTask, TaskSubmission  # noqa: E402
from app.services import timeline_service  # noqa: E402


def backfill_legacy_submissions(db) -> int:
    """为缺版本的旧任务补 v1。仅对有结果快照的任务，幂等。"""
    tasks = db.execute(
        select(InspectionTask).where(
            InspectionTask.status.in_(["SUBMITTED", "APPROVED"])
        )
    ).scalars().all()
    created = 0
    for t in tasks:
        exists = db.execute(
            select(TaskSubmission.submission_id)
            .where(TaskSubmission.task_id == t.task_id).limit(1)
        ).scalar_one_or_none()
        if exists:
            continue
        db.add(TaskSubmission(
            submission_id=f"sub-{uuid.uuid4().hex[:20]}",
            task_id=t.task_id,
            version=1,
            observation_note=t.result_note or "",
            conclusion=t.result_conclusion or "UNCERTAIN",
            measurements_json="[]",
            observed_at=t.observed_at or t.completed_at or t.created_at,
            attachment_ids_json=t.attachment_ids or "[]",
            submitted_by=t.assignee or "SYSTEM",
            submitted_at=t.completed_at or t.created_at,
        ))
        created += 1
    return created


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-backfill", action="store_true", help="只建表，不回填历史")
    args = parser.parse_args()

    # 幂等建表（create_all 等价 IF NOT EXISTS）
    Base.metadata.create_all(bind=engine)
    print("[migrate_v2] 全部新表已就绪（business_events/task_submissions/task_reviews）")

    if args.no_backfill:
        return

    db = SessionLocal()
    try:
        stats = timeline_service.backfill(db)
        legacy = backfill_legacy_submissions(db)
        db.commit()
        print(
            f"[migrate_v2] 时间线回填：事件迁移 {stats['event.status-changed']} 条，"
            f"任务轨迹 {stats['task']} 条，跳过 {stats['skipped']} 条；"
            f"旧任务补 v1：{legacy} 条"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
