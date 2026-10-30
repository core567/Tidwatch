"""V2.2 增量迁移：新增站内通知表 notifications。

幂等、可回退：
- 升级：仅在表不存在时创建（IF NOT EXISTS），不动任何现有表/数据；
- 回退：DROP TABLE notifications（通知为可重建的协同数据，无外键指向它）。

用法：
    python scripts/migrate_notifications.py           # 升级（幂等）
    python scripts/migrate_notifications.py --downgrade  # 回退删表
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

# 显式导入，确保模型已注册到 Base.metadata
from app.db.session import engine  # noqa: E402
from app.models import Base, Notification  # noqa: E402,F401

DDL = """
CREATE TABLE IF NOT EXISTS notifications (
    notification_id VARCHAR(48) PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT DEFAULT '',
    task_id VARCHAR(48) NOT NULL REFERENCES inspection_tasks(task_id),
    submission_id VARCHAR(48),
    version INTEGER DEFAULT 0,
    review_id VARCHAR(48),
    recipient_id VARCHAR(64) NOT NULL,
    created_by VARCHAR(64) DEFAULT 'SYSTEM',
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS ix_notifications_task_id ON notifications(task_id);
CREATE INDEX IF NOT EXISTS ix_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS ix_notifications_created_at ON notifications(created_at);
"""


def upgrade() -> None:
    with engine.begin() as conn:
        for stmt in [s.strip() for s in DDL.split(";") if s.strip()]:
            conn.execute(text(stmt))
    print("upgrade ok: notifications ready")


def downgrade() -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS notifications"))
    print("downgrade ok: notifications dropped")


if __name__ == "__main__":
    if "--downgrade" in sys.argv:
        downgrade()
    else:
        upgrade()
    Base  # 保持导入被使用（模型注册）
