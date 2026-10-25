# E 阶段最终验收报告（巡检协同中心：7 态任务 / 版本化提交 / PC 复核）

> 验收日期：2026-10-26。事件 8 态状态机全程未改动。

## 1. 提交

| 模块 | 提交 | 内容 |
|---|---|---|
| E1 设计 | `18fe4ad` | 状态机/兼容/迁移设计 |
| E2 后端 | `978f6e2` | 7 态、task_submissions/task_reviews、接口、迁移脚本 |
| E3 PC 前端 | `ec67479` | 草稿/派发/版本/复核抽屉、P05 增强 |
| E5 迁移 | （数据库操作，无代码提交） | 开发库迁移 |

## 2. 备份与迁移

- 一致性备份：`data/backups/tidewatch-pre-e-20261025-235840.db`（SQLite backup API 合并 WAL，quick_check=ok，源/备计数一致；db-wal/db-shm 同目录留存）。
- 迁移脚本 `scripts/migrate_v2.py`：仅新增 `task_submissions`、`task_reviews` 两表，未修改任何旧表结构。
- 幂等：第一次补齐 14 条此前未回填的 `event.status-changed`、旧任务补 v1=0；第二次 0 新增（跳过 28）。重复迁移检查组数=0。
- 约束：`uq_task_submission_version(task_id, version)` 唯一索引 + task_id/submission_id 索引；`integrity_check=ok`、`foreign_key_check=0`。

## 3. 数据完整性（迁移前后逐项核对）

- 事件：TW-001 RECOVERED(v2)、TW-002 INVESTIGATING(v3)，未变化。
- 正式任务：tsk-3ae89d2592744a83→TW-001 IN_PROGRESS；tsk-b39b051e0ee04f7f→TW-002 PENDING，未变化。
- observations **651**、evidences 6、assessments 6、blind_spots 105（场景演练历史存量）均保持。
- task_submissions/task_reviews 当前 0/0（开发库无已回填任务；联调用临时任务已清理）。

## 4. 后端与接口

- 后端按 MQTT_ENABLED=true 原方式重启，`/api/health=ok`、observations 651。
- 旧接口兼容（开发库临时任务端到端验证后清理）：create→ACCEPT→START→results 生成 SUBMITTED/v1；重复提交 409；空原因退回 422；合法退回→IN_PROGRESS→重提 v2（v1 归档、照片按版本隔离）→APPROVE；终态再操作 409；照片上传 200。
- 新只读端点 `/submissions`、`/reviews` 正常；TaskOut 旧字段保留，增量 draft/latestVersion/latestReview；默认列表隐藏 DRAFT。
- 自动化：后端 **141 passed**；前端 tsc/build、node:test 13 通过；小程序 tsc 通过。

## 5. 尚未完成 / 待人工验证

- **微信开发者工具人工联调未执行**（本轮按要求未改小程序 UI）。已验证：小程序依赖的旧接口（list/get/ACCEPT/START/CANCEL/results/upload）契约与行为兼容、tsc 通过；**未验证**：真机/开发者工具内拍照、提交、照片下载 `/api` 前缀链路的端到端人工走查。
- 首页/巡检中心对新状态（DRAFT/APPROVED）的更多可视化可在后续视觉统一阶段细化。

## 6. 边界

未清库、未重置、未删除旧路由/旧接口、未改 `.env`/密钥；E5 之后未再执行任何迁移。
