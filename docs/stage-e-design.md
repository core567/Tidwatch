# E 阶段设计：巡检任务 7 态状态机、版本化提交与 PC 复核

> 状态：待评审。事件 8 态机保持不变；本阶段只扩展**任务**侧。
> 原则：旧 5 态流程、旧动作接口、`POST /results` 全部继续可用；新增能力以增量字段/新动作叠加。

## 1. 现状盘点（已核对代码）

旧任务状态（`app/schemas/task.py`、`task_service.py`）：

```
PENDING ──ACCEPT──▶ ACCEPTED ──START──▶ IN_PROGRESS ──submit results──▶ SUBMITTED
   │                     │                      │
   └──────────────────────┴────── CANCEL ───────┴──────────────▶ CANCELLED
```

- 动作接口：`POST /api/inspection-tasks/{id}/actions`，body `{action: ACCEPT|START|CANCEL}`。
- 提交接口：`POST /api/inspection-tasks/{id}/results`（仅允许 IN_PROGRESS/ACCEPTED），提交后 status=SUBMITTED，并把结果写在任务行（`result_note/conclusion/observed_at/attachment_ids`），附件 `attachments.related_type='task_result'`、`related_id=task_id`。
- PC：`api.tasks / createTask`（P05 可创建、回填、看照片）。小程序：`listTasks/getTask/actTask/submitTaskResult/uploadPhoto`。
- 旧终态：`FINAL_STATUSES = {SUBMITTED, CANCELLED}`（SUBMITTED 后无法再操作，也没有 PC 复核/退回）。

旧模型的问题（E 要解决）：提交结果直接覆盖任务行，无版本；附件只挂任务，不挂每次提交；无复核记录、无退回重提。

## 2. 新 7 态与旧 5 态映射

```
DRAFT(草稿,仅PC可编辑)
   │ DISPATCH（PC 派发）
   ▼
PENDING(待接收/待派发)  ──ACCEPT──▶ ACCEPTED ──START──▶ IN_PROGRESS
   ▲                                                          │
   │ REJECT（PC 复核退回，附带原因，生成新版本待补）           │ submit（每次提交新增一个 submission 版本）
   │                                                          ▼
   └──────────────────────────────────────────────  SUBMITTED(待复核)
                                                                │ APPROVE（PC 通过）
                                                                ▼
                                                           APPROVED(已完成)
   任意非终态 ──CANCEL──▶ CANCELLED
```

| 新状态 | 含义 | 对应旧状态 | 说明 |
|---|---|---|---|
| DRAFT | 草稿，仅 PC 可见/可编辑/可派发，不推小程序 | （新增） | 不进现场待办 |
| PENDING | 已派发待接收 | PENDING | 语义不变；由 DISPATCH 或直接建任务进入 |
| ACCEPTED | 已接收 | ACCEPTED | 不变 |
| IN_PROGRESS | 执行中 | IN_PROGRESS | 不变 |
| SUBMITTED | 待复核 | SUBMITTED | **语义收窄为“待 PC 复核”**（旧含义“已回填终态”由 APPROVED 取代） |
| APPROVED | 复核通过、已完成 | （新增，旧 SUBMITTED 的“闭环完成”语义落此） | 终态，任务完成不自动关闭事件 |
| CANCELLED | 已取消 | CANCELLED | 终态 |

关键兼容决策：**保留 SUBMITTED 名称不变**，旧小程序提交后仍进入 SUBMITTED（现场端无需改状态判断）；只是 SUBMITTED 不再是终态，之后由 PC APPROVE/REJECT 推进。

## 3. 合法迁移表（动作 / 角色 / 前置）

| 动作 | 源状态 → 目标状态 | 角色 | 前置条件 | 备注 |
|---|---|---|---|---|
| `SAVE_DRAFT` | (无)→DRAFT | PC(admin/analyst) | 创建草稿 | 新建接口 `POST /inspection-tasks` 带 `draft:true`；对小程序不可见 |
| `DISPATCH` | DRAFT→PENDING | PC | 草稿 | 也允许“直接派发”（无草稿时 create 即 PENDING，等同现状） |
| `UPDATE_DRAFT` | DRAFT→DRAFT | PC | 草稿 | `PUT` 编辑标题/断面/优先级/理由 |
| `ACCEPT` | PENDING→ACCEPTED | 现场/PC | PENDING | **旧动作，语义不变** |
| `START` | PENDING/ACCEPTED→IN_PROGRESS | 现场/PC | — | **旧动作，语义不变** |
| `submit results` | IN_PROGRESS/ACCEPTED→SUBMITTED | 现场 | 已开始 | **旧接口保留**；每次新增 submission 版本，不覆盖 |
| `RE_SUBMIT` | IN_PROGRESS→SUBMITTED | 现场 | 被退回（回到 IN_PROGRESS）后再次提交 | 复用 `/results`，生成 v2、v3… |
| `APPROVE` | SUBMITTED→APPROVED | PC(admin/analyst) | 存在至少 1 个 submission | 通过，终态 |
| `REJECT` | SUBMITTED→IN_PROGRESS | PC | 必填退回原因 | 退回补充，任务回到执行中；可再次提交新版本 |
| `CANCEL` | DRAFT/PENDING/ACCEPTED/IN_PROGRESS/SUBMITTED→CANCELLED | PC/有权限者 | 非终态 | SUBMITTED 也允许取消（放弃复核） |

非法迁移一律 409（沿用现有 ConflictError / 状态机校验风格）。APPROVED/CANCELLED 为终态。

## 4. 提交版本、退回重提、照片、复核记录

### 4.1 `task_submissions`（追加式，只 INSERT 不 UPDATE/DELETE）
| 列 | 说明 |
|---|---|
| submission_id (PK) | `sub-xxxx` |
| task_id (FK, index) | 所属任务 |
| version (int) | 任务内从 1 递增，唯一 (task_id, version) |
| observation_note | 现场观察记录 |
| conclusion | NORMAL/ABNORMAL/UNCERTAIN |
| measurements_json | 复测指标（结构化，可空数组） |
| observed_at | 现场观测时间 |
| attachment_ids_json | 本次提交的照片 ID 列表 |
| submitted_by / submitted_at | 提交人/时间 |
| superseded_at | 被退回后留痕（该版本不再是最新，可空）；历史行不删 |

- `/results` 每次调用 INSERT 一行 version+1，并把**任务快照字段**（result_note/conclusion/observed_at/attachment_ids）更新为最新版本（保持旧读模型与小程序 TaskOut 不变）。
- REJECT 时把最新 submission 标记 `superseded_at`（版本归档），任务回 IN_PROGRESS；再次 `/results` 生成新版本。旧版本、其照片、退回意见全部保留。

### 4.2 `task_reviews`（追加式）
| 列 | 说明 |
|---|---|
| review_id (PK) | `rev-xxxx` |
| task_id / submission_id | 针对哪次提交的复核 |
| version | 被复核的提交版本 |
| decision | APPROVED / REJECTED |
| comment | 复核意见；REJECT 时必填（退回原因） |
| reviewer / reviewed_at | 复核人/时间 |

### 4.3 照片关联
- 上传接口 `/uploads` 不变，返回 attachmentId。
- `/results` 提交时，本次附件在 `task_submissions.attachment_ids_json` 留存；同时维护 `attachments.related_type='submission'`、`related_id=submission_id`（旧的 `task_result/task_id` 关系继续保留为“最新快照”，二者并存，向后兼容）。
- 重新提交**不修改**旧版本的附件关联；照片按版本查看。旧照片在旧版本仍可预览/下载。

## 5. 接口兼容方案（关键）

全部为**增量**，不删不改旧字段：

1. `POST /inspection-tasks`
   - 旧调用（无 draft）→ 直接 PENDING，行为不变（PC、现场既有逻辑零改动）。
   - 新增可选 body：`draft: true` → 创建 DRAFT。
2. `POST /inspection-tasks/{id}/actions`
   - 旧动作 ACCEPT/START/CANCEL 完全保留、状态结果不变（SUBMITTED 仍可 CANCEL）。
   - 新增 `DISPATCH|APPROVE|REJECT`。TaskActionIn 的 action 枚举扩展为联合；REJECT/APPROVE 接受可选 `comment`。
3. `POST /inspection-tasks/{id}/results`
   - 路径、请求体（observationNote/conclusion/attachmentIds/observedAt/requestReevaluate）保持兼容。
   - 行为升级：新增 submission 版本；任务仍进入 SUBMITTED。旧调用方无需感知。
   - 新增可选 `measurements`（复测指标数组）。
4. 新增只读：
   - `GET /inspection-tasks/{id}/submissions`（版本列表，含每版照片、结论、时间）。
   - `GET /inspection-tasks/{id}/reviews`（复核记录）。
5. TaskOut（响应）增量字段（都有默认值，旧客户端忽略多余字段）：
   - `draft`（bool，由 status==DRAFT 派生或显式列）、`latestVersion`、`latestReview`（可空）。
   - 列表默认对小程序隐藏 DRAFT：小程序列表沿用“非草稿”过滤；PC 列表加 `includeDrafts`（默认 false，PC 显式传 true）。
6. 小程序（本轮不改 UI）：仍只调 ACCEPT/START/CANCEL/results/upload，新状态对它透明；DRAFT 不出现在它的待办；SUBMITTED 仍按“已回填”展示，PC 复核结果后续联调阶段再在小程序呈现。

兼容不仅是 200：回归会验证旧流程 PENDING→ACCEPTED→IN_PROGRESS→SUBMITTED 行为、旧 TaskOut 字段、旧照片回显全部正确。

## 6. 并发 / 重复 / 非法处理

- **版本号**：在 service 内对任务加锁/按当前 max(version)+1 计算，并对 (task_id,version) 加唯一约束；并发提交冲突返回 409，由调用方重试。
- **重复提交**：`/results` 要求 IN_PROGRESS/ACCEPTED；SUBMITTED 再提交 → 409（必须先复核通过或退回）。
- **重复复核**：APPROVE/REJECT 仅 SUBMITTED 可执行；终态再操作 → 409。
- **REJECT 原因**：空原因 → 422。
- **取消**：APPROVED 不可取消 → 409。
- 所有动作与 business_events 双写（task.dispatched/task.approved/task.rejected/task.submitted），RunTrace 保留。

## 7. 数据库迁移（幂等，隔离库先行）

`scripts/migrate_v2.py` 扩展（沿用已验证的幂等模式）：
- `CREATE TABLE IF NOT EXISTS task_submissions (...)`、`task_reviews (...)`；
- `inspection_tasks` 增列采用“先 PRAGMA table_info 检查再 ALTER TABLE ADD COLUMN”，已存在则跳过：
  - 本期**不强制**加新列——DRAFT/latestVersion/latestReview 均可由 status + 子查询派生，避免对热表 ALTER；如 PC 列表性能需要再加视图/列（评估后决定，默认不加）。
- 不回填旧数据：历史已 SUBMITTED 任务若无 submission 行，提供一次性可选回填（把任务行结果补成 v1），**默认开启且幂等**，保证旧任务也有版本可复核/可看照片。
- 迁移只建表/补列/可选回填 business_events 不受影响；事件相关表零改动。

回滚方案：迁移仅新增表与行；回滚=保留新表（不影响旧代码），或在备份后 DROP 新表；开发库迁移前先在线一致性备份（backup API，合并 WAL）。

## 8. 隔离库测试矩阵（E5 前必须全绿）

旧接口兼容：旧建任务=PENDING；ACCEPT/START/results 走通；旧 TaskOut 字段不变；旧照片按 task 回显仍可用。
新增：草稿建/编/派发；直接派发；提交 v1→REJECT(原因必填/空 422)→重提 v2→APPROVE；历史版本与照片不被覆盖；reviews 列表；重复提交/重复复核/终态操作/取消终态 409；并发版本冲突 409；小程序列表不含 DRAFT。
全程事件 8 态机零改动、事件相关测试不回归；business_events 留痕齐全。

## 9. 实施顺序与检查点
E1 设计（本文）→ E2 后端模型/迁移/接口（隔离库测试）→ E3 PC 巡检中心（草稿/详情 4 tab/审核区/版本时间线）→ E4 小程序旧接口回归（不改 UI）→ E5 备份→汇报→**待你二次确认**→开发库迁移。
