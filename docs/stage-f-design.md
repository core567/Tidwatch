# F 阶段实施方案（修订版）：事件复盘、处置前后对比、规则化恢复评估与报告

> 状态：待评审，未编码。
> 铁律：不修改事件 8 态机与 E 阶段任务状态机；旧接口不破坏；不做数据库迁移（仅兼容增量字段）；
> 事实（观测）/ 规则评估（恢复评估）/ 最终状态（状态机）三者严格分离。

## 0. 保留的页面与路由（各自职责，互不替代）

| 路由 | 页面 | 职责 | 处理 |
|---|---|---|---|
| `/review` | **复盘列表**（新） | 选择事件进入复盘 | 新增 |
| `/review/:eventId` | **单事件复盘**（新） | 时间线/对比/恢复评估/现场处置/证据 + 打印 | 新增 |
| `/reviews/:eventId` | 旧**研判单** P08 | 实时演化研判单（保持现状） | 保留，不删不改路由 |
| `/reports` | **月报统计** P09 | 官方月报批次/频次 | 保留现状 |

兼容：校验路由匹配优先级（静态 `/review`、动态 `/review/:id`、`/reviews/:id` 不冲突）；刷新直达、返回列表、旧链接 `/reviews/:id`、`/reports` 均可用。六页导航中 05「事件复盘与报告」指向 `/review`，并在复盘列表提供「月报统计 → /reports」入口。

## 1. 数据来源（优先复用，零迁移）

- `GET /events/{id}/review`：范围演化/假设/支持反证证据/再评估/盲区/任务/run_trace/时序关系。
- `GET /events/{id}/timeline`：business_events 统一时间线。
- `GET /events/{id}`：状态、allowedActions、trigger、changeCount。
- `GET /inspection-tasks?eventId=` → 每个任务 `GET /tasks/{id}/submissions`、`/reviews`：版本提交（含 attachment_ids、observed_at、submitted_by/at、superseded_at）与复核（decision/comment/reviewer/reviewed_at）。
- `GET /reaches/{id}/observations?metric=&from=&to=&sourceType=&quality=`：真实观测窗口。
- 照片：现有 `/uploads/{id}/content`（attachmentUrl），按 submission.attachmentIds 关联，**不使用任务行的最新快照冒充历史版本**。

后端唯一计划的兼容增量：`build_review_payload` 增补只读字段 `taskSubmissions`、`taskReviews`（按任务分组的真实版本/复核），并新增恢复评估端点（第 3 节）。均为**新增字段/新路由**，旧 P08、小程序不读取，无破坏，无需建表/迁移。

## 2. 处置前后时间窗定义（修订：三段，不把首异当处置完成）

对每个涉及断面、每个可对比指标（waterLevel、turbidity、flowLevel；均 MQTT 模拟），用**可追溯锚点**切三段：

- **异常前基线 BASELINE**：`[firstSeenAt − W, firstSeenAt)`，默认 W=60 分钟（可在 UI 调整）。
- **异常期间 ANOMALY**：`[firstSeenAt, recoveryAnchor)`。
- **处置后 POST**：`[recoveryAnchor, recoveryAnchor + W]`。

`recoveryAnchor`（处置完成/恢复判定时间锚点）按优先级取**真实记录**：
1. 该事件关联任务中**最新一次 APPROVED 复核的 reviewed_at**（task_reviews，最优先，代表人工确认处置完成）；
2. 否则事件进入 `RECOVERY_PENDING`/`RECOVERED` 的**状态迁移时间**（event_status_transitions / business_events）；
3. 都没有 → **锚点缺失**：前端不生成 POST 段、不给“处置前后”结论，明确显示「无实际处置完成记录，时间锚点缺失」，只展示 BASELINE/ANOMALY。

每段展示：起止时间、样本数、单位、来源（SIMULATED）、质量（qualityFlag 非 GOOD 计数/剔除口径）、聚合值（默认**中位数**，附均值，避免单点尖峰）。
- 任一段样本数 < 最小阈值（默认 3）→ 该指标标记「数据不足，无法对比」。
- 官方水质（pH/DO/氨氮，每日快照）：仅当存在**锚点前后两个不同日期**的快照才对比，并标 OFFICIAL_AUTO；否则「官方快照不足以覆盖处置前后，不对比」。绝不插值。

**事实层只描述**：POST 相对 BASELINE/ANOMALY 的数值变化（含单位、样本数、时间、来源），使用措辞「观测值由 X 变为 Y」，**不写“处置有效/恢复正常”**。

## 3. 规则化恢复评估（独立模块，只读，不自动改状态）

### 3.1 端点
`GET /api/events/{id}/recovery-assessment` → 纯函数计算（新增路由，无迁移）：
```
{
  result: "RECOVERED_SUPPORTED" | "NEEDS_OBSERVATION" | "INSUFFICIENT_EVIDENCE",
  label: "证据支持恢复" | "仍需观察" | "证据不足、无法判断",
  evaluatedAt, ruleVersion,
  factors: [{ code, passed, weight, detail, sources:[...] }],
  windows: [{ reachId, metric, phase, start, end, sampleCount, median, mean, unit, sourceType, qualitySummary }],
  disclaimers: [string]
}
```

### 3.2 规则表（多证据加权，任一硬条件不满足不得判“支持恢复”）

| 因子 | 规则 | 不满足时影响 |
|---|---|---|
| F1 处置完成可追溯 | 存在处置锚点（APPROVED 复核优先，否则恢复相关状态迁移） | 无锚点→直接 INSUFFICIENT_EVIDENCE |
| F2 观测回落 | 处置后窗口内，异常指标（trigger 指标 + scope 内 GOOD 质量观测）中位数回到基线带内：`|post_med − baseline_med| ≤ max(基线波动带 P95−P5, 容差)`，且相对异常峰值回落 ≥ 设定比例 | 未回落/仍超阈→NEEDS_OBSERVATION |
| F3 数据质量与样本量 | POST 窗每指标有效(GOOD)样本 ≥ n_min(默认3)；非 GOOD 不计入 | 样本不足/质量差→INSUFFICIENT_EVIDENCE |
| F4 现场复核闭环 | 最新提交被 **APPROVED**（task_reviews）；若最新为 REJECTED 或仍 SUBMITTED/IN_PROGRESS→不支持恢复 | 未闭环→NEEDS_OBSERVATION |
| F5 无开放盲区 | scope 内无 end_at 为空的 blind_spot | 有开放盲区→NEEDS_OBSERVATION/INSUFFICIENT |
| F6 证据完整性 | 存在 MANUAL 证据或提交记录关联该事件；无证据→证据不足 | 无现场证据→INSUFFICIENT_EVIDENCE |
| F7 持续性（防抖） | POST 窗内越限点占比 < 阈值（默认 <20%），避免一次回落即判定 | 反复越限→NEEDS_OBSERVATION |

判定：
- **RECOVERED_SUPPORTED**：F1 且 (F2,F3) 通过，且 F4/F5/F7 均不否决（F6 至少有人工或提交佐证）。
- **NEEDS_OBSERVATION**：有锚点、有数据，但 F2/F4/F5/F7 显示尚未稳定或未闭环。
- **INSUFFICIENT_EVIDENCE**：F1/F3/F6 等导致无法判断（锚点缺失、样本不足、无现场证据）。

说明：评估**只读、可重复、幂等**，输出依据与不确定性；**绝不调用任何状态迁移、不改事件状态**。是否 RECOVERED 仍由现有 8 态机的合法人工操作决定。照片/单一下降**不构成**恢复依据（F2 用窗口统计、F7 看持续性、F4 看复核闭环）。

## 4. 页面布局

### 4.1 复盘列表 `/review`
```
PageHeader 事件复盘与报告        [搜索 标题/编号] [状态: 全部/已恢复/研判中/无法判定]
Card 表格：事件 | 状态 | 涉及范围 | 首发 | 最近更新 | 提交版本数* | 最新复核* | [查看复盘]
Pager 分页                              右上角次级链接：月报统计 → /reports
```
*版本数/最新复核：为避免列表 N+1，默认**不在列表拉取**；如确需，由后端在 review 列表用聚合一次性返回（兼容增量，默认先不做，列内只放「查看」）。行点击 `/review/:id`。

### 4.2 单事件复盘 `/review/:eventId`
```
顶部：←返回列表  🖨打印/导出PDF        标题 / 事件号 / 当前状态徽章 / 规则版本
Tab1 复盘总览
   - 事件摘要（标题/类型/范围/首发/最近/触发指标）+ 范围演化版本
   - 恢复评估卡（result 徽章 + 各 factor 通过/不通过 + 依据 + 不确定性）
   - 关键结论三分栏：【观测事实】【规则评估】【事件状态（状态机控制）】
Tab2 统一时间线   BusinessTimeline（business_events，含迁移/任务/提交/复核/证据/盲区）
Tab3 现场处置
   - 每个关联任务：状态/负责人；其 task_submissions 按版本（v1,v2…）展示
     提交人/时间、观测记录、复测、照片缩略图(attachmentUrl)、是否被退回(supersededAt)
     task_reviews：审核人/时间/通过或退回原因；明确“当前版本 vs 历史版本”，不串版本
   - 无任务/无提交：明确空态
Tab4 观测对比
   - 断面×指标三段窗（BASELINE/ANOMALY/POST）表 + 趋势小图：起止/样本/中位数/单位/来源/质量
   - 时间锚点说明（锚点来源或“锚点缺失”）；官方快照条件对比或缺失说明
Tab5 证据与评估
   - 支持/反证证据、假设、再评估版本、盲区（沿用 review payload），逐条带来源
底部：来源与口径声明（官方实时 / MQTT 模拟 / 现场人工 / 规则建议）+ 免责声明
```

## 5. 正式打印报告（@media print，交付物）

打印内容按序：报告标题与事件号、**生成时间**、事件摘要、当前状态、数据口径与来源说明、统一时间线、处置过程（任务/版本/审核）、三段观测对比、**恢复评估（结果+因子依据+不确定性）**、证据来源清单、免责声明与规则版本。
打印时隐藏：左侧导航、顶栏、Tab 切换条、所有按钮（返回/打印/操作）、悬停控件；自动展开各分区内容（打印态平铺全部 Tab）。复用现有 `@media print` 体系并补复盘页专用规则。A4，白底黑字，链接显示文本不依赖颜色。

## 6. 事实 / 评估 / 状态 分离（强制）

- 观测对比卡：只出现真实数值与变化，标签「观测事实」。
- 恢复评估卡：标签「规则评估（demo-rules-v1）」，给结果与依据、不确定性。
- 事件状态：始终显示状态机当前值，并注明「由人工合法操作经状态机变更，评估不自动改状态」。
- 任何文案不得由前端根据指标自行推断“处置成功/恢复”。

## 7. 实施与提交（F1–F5，各自测试 + Git 检查点，隔离库）
- **F1 后端**：review payload 增量 `taskSubmissions/taskReviews`（真实版本/复核）；新增 `/recovery-assessment` 纯函数 + 隔离库单测（锚点缺失/证据不足/仍需观察/支持恢复/单点下降不通过/防抖）。不迁移。
- **F2** 复盘列表（搜索/状态/分页/路由兼容）。
- **F3** 复盘详情骨架 + Tabs + 统一时间线 + 现场处置版本/照片/复核追溯。
- **F4** 三段观测对比（含锚点缺失、官方快照条件、缺失标记）。
- **F5** 恢复评估卡 + 正式打印报告 + 全量回归（旧 /reviews、/reports、P03/P04/P05 不受影响；后端 pytest、前端 tsc/build/node:test、小程序 tsc）。

## 8. 验收标准
1. 四路由各司其职、刷新/返回/旧链接兼容，旧研判单与月报未删未坏。
2. 复盘可追溯：事件↔时间线↔任务↔提交版本（含提交人/时间/复测/照片）↔复核（审核人/时间/通过或退回原因）；历史版本不被当前版本覆盖。
3. 三段窗锚点来自真实记录；锚点缺失不出前后结论；官方快照不插值；缺数据显式标记。
4. 恢复评估给出三态结果与因子依据；单指标下降不判恢复；评估不改状态（无写调用）。
5. 打印为正式交付物，含规定各节与生成时间，隐藏交互控件。
6. 仅兼容增量、无数据库迁移；隔离库测试通过；正式演示数据不被改动。
7. 小程序 UI 本阶段不改；E 阶段兼容性保持。
