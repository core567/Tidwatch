"""初始化数据库表（M0 阶段使用 metadata.create_all）。

M0 用此脚本快速验证模型；结构演进在后续阶段引入 Alembic 迁移。
用法（在 backend/ 目录）：
    .venv/Scripts/python.exe scripts/init_db.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# 允许从 backend/ 直接运行
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import DATA_DIR, settings  # noqa: E402
from app.core.logging import configure_logging, get_logger  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.models import Base  # noqa: E402  # 聚合导入全部模型


def main() -> None:
    configure_logging()
    logger = get_logger("init_db")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    tables = sorted(Base.metadata.tables.keys())
    logger.info("database: %s", settings.resolved_database_url)
    logger.info("created/verified %d tables:", len(tables))
    for t in tables:
        logger.info("  - %s", t)


if __name__ == "__main__":
    main()
