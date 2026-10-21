"""重置数据库：删表重建并写入种子数据。

危险操作，默认要求确认；--yes 跳过（供脚本/CI 使用）。
只作用于配置指向的 SQLite 文件，不触碰任何其他文件。
用法（backend/ 目录）：
    .venv/Scripts/python.exe scripts/reset_db.py          # 交互确认
    .venv/Scripts/python.exe scripts/reset_db.py --yes    # 直接执行
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import DATA_DIR, settings  # noqa: E402
from app.core.logging import configure_logging, get_logger  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.models import Base  # noqa: E402


def reset() -> None:
    logger = get_logger("reset")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("dropping all tables ...")
    Base.metadata.drop_all(bind=engine)
    logger.info("creating all tables ...")
    Base.metadata.create_all(bind=engine)

    # 延迟导入，确保表结构就绪（脚本运行时 scripts/ 在 sys.path）
    from seed_data import seed  # noqa: E402

    seed()
    logger.info("reset complete: %s", settings.resolved_database_url)


def main() -> None:
    configure_logging()
    if "--yes" not in sys.argv:
        print(f"将重置数据库 {settings.resolved_database_url}，全部现有数据会被清除。")
        ans = input("输入 yes 继续: ").strip().lower()
        if ans != "yes":
            print("已取消。")
            return
    reset()


if __name__ == "__main__":
    main()
