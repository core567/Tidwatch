# TideWatch Git 开发演进（参赛材料）

> 数据来源：当前仓库 `fusion/f2-overview-migration` 分支真实 Git 历史。
> 记录日期：2026-11-05；基线提交：`2fa77e2918f60ac9a6d5accc2039692e29deec72`。
> 全部提交为线性历史，未使用 rebase、amend、squash；没有改写过去记录。
> 完整哈希均可在公开仓库查看：https://github.com/core567/Tidwatch

---

## 1. 分支与版本状态

| 项 | 值 |
|---|---|
| 开发分支 | `fusion/f2-overview-migration` |
| 远程 | `origin/fusion/f2-overview-migration`（与本地同步） |
| 当前功能基线 | `2fa77e2918f60ac9a6d5accc2039692e29deec72` |
| PDF 字体提交 | `bc1000ae211cea2242afb888c782642e6f905462`（Noto Sans SC，OFL 1.1） |
| main | `b726ca33b79a40a3bf50b6edf71576644affdff5`（落后 17 个提交，尚未合并） |
| 标签 | `stable/3d-v2-integration`、`stable/tidewatch-pre-optimization`（未新增参赛标签） |
| 提交总数 | 55（2026-10-21 至 2026-11-05，含字体提交） |

---

## 2. 主要开发阶段

### 2.1 M0 工程基线（2026-10-21）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`963df6c`](https://github.com/core567/Tidwatch/commit/963df6c3b6c838638e289e87ba78c6ac94acee5a) | 2026-10-21 | 微信原生 TS 小程序、Python 3.12 FastAPI 后端骨架 |
| [`1d40854`](https://github.com/core567/Tidwatch/commit/1d408541f6cd5a4cc71980972875a70b2cf051c6) | 2026-10-21 | 后端 pytest、前端 typecheck/build、小程序 tsc 三端回归 |

### 2.2 M1 数据链与 3D 场景（2026-10-22 ~ 10-24）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`71700e8`](https://github.com/core567/Tidwatch/commit/71700e886c80df6756c81e21f20f7003d78c1d42) | 2026-10-22 | 变化检测与事件服务、3D 镜头飞行与异常联动、事件中心与工作台 |
| [`fa682ae`](https://github.com/core567/Tidwatch/commit/fa682aec1954a001302e9ab8ba238c58fc7a4273) | 2026-10-24 | 研判闭环：证据/再评估/盲区/巡检/小程序对接/月报分析 |

### 2.3 M2 事件中心与研判工作台（2026-10-25）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`5ce7d58`](https://github.com/core567/Tidwatch/commit/5ce7d589e5ec2d21897b22d97b32c84169618c8b) | 2026-10-25 | 全局框架/首页 + 后端时间线基础 |
| [`1fba596`](https://github.com/core567/Tidwatch/commit/1fba596ca311a05c7e47529d21f404e3c65ec0a6) | 2026-10-25 | 异常研判三栏工作台、统一时间线、动态动作 |
| [`413352b`](https://github.com/core567/Tidwatch/commit/413352b4c580312a585a86daa21260e61b346bbd) | 2026-10-25 | sticky 处置流程条与真实阶段推导 |
| [`489a15a`](https://github.com/core567/Tidwatch/commit/489a15a28a4d31126d0cc0819998c8248dc977bc) | 2026-10-25 | 事件列表搜索/筛选/分页 |

### 2.4 M3 巡检闭环与版本化提交（2026-10-25）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`18fe4ad`](https://github.com/core567/Tidwatch/commit/18fe4ade8d9dd31e0f4a8fe5b2e601a849f6ee3b) | 2026-10-25 | 任务 7 态状态机、版本化提交、PC 复核设计 |
| [`978f6e2`](https://github.com/core567/Tidwatch/commit/978f6e2e995f605761f468ad184865cd28334530) | 2026-10-25 | 后端 7 态任务、提交/复核接口 |
| [`ec67479`](https://github.com/core567/Tidwatch/commit/ec67479992342661689c5cd4b125a2ec1a1622f0) | 2026-10-25 | PC 巡检中心草稿/派发/版本/复核抽屉 |

### 2.5 M4 复盘、报告与故障矩阵（2026-10-25 ~ 10-26）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`b97e4aa`](https://github.com/core567/Tidwatch/commit/b97e4aa571edd0dee80a878998f1cf2dce45d1b0) | 2026-10-26 | 事件复盘列表 |
| [`21b1a3e`](https://github.com/core567/Tidwatch/commit/21b1a3e3163dda42b6735eb3161e4ded4b1824c3) | 2026-10-26 | 单事件复盘详情（四 Tab） |
| [`75e386e`](https://github.com/core567/Tidwatch/commit/75e386e5bfae6dbd61e1c3a458327f884a90462a) | 2026-10-26 | 正式事件复盘报告（打印/PDF） |
| [`a5b9981`](https://github.com/core567/Tidwatch/commit/a5b99816d79c79d16520b0df9ea691c1f4acd647) | 2026-10-25 | S1–S5 自动化回归、故障矩阵、场景控制台、语音感知 |

### 2.6 AI 助手（2026-10-26）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`97d94db`](https://github.com/core567/Tidwatch/commit/97d94db1c646586a537674e134a690f9d5f23d90) | 2026-10-26 | 后端双层架构：规则工具 + OpenAI 兼容适配 |
| [`7529ac5`](https://github.com/core567/Tidwatch/commit/7529ac50de224493f81c1dd8b5cfcfedd09e12bb) | 2026-10-26 | PC 全局 AI 助手抽屉、Web Speech 语音、3D 联动 |
| [`f59aa93`](https://github.com/core567/Tidwatch/commit/f59aa93920062b3789685694f6052cf6258dca2b) | 2026-10-26 | AI 助手视觉与交互优化 |

### 2.7 V2 视觉与业务融合（2026-11-01 ~ 11-04）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`bd5db6c`](https://github.com/core567/Tidwatch/commit/bd5db6c66805a95a5d0e10ee682760f4a3a9f31a) | 2026-11-01 | V2 视觉基础组件与作用域样式 |
| [`cffe6ad`](https://github.com/core567/Tidwatch/commit/cffe6ad3e6450775c5f7d483ce17c5836a4926de) | 2026-11-02 | 原生 3D 场景融合进数字孪生页 |
| [`8ce000e`](https://github.com/core567/Tidwatch/commit/8ce000ecf7ac8311177419937df792aa4f8de57e) | 2026-11-02 | 水环境分析页真实数据与趋势 |
| [`49a21af`](https://github.com/core567/Tidwatch/commit/49a21afb2e9ade3fff896d1f2fdbdaac2fd31233) | 2026-11-02 | 事件中心与研判工作台融合（真实 8 态） |
| [`a0989ce`](https://github.com/core567/Tidwatch/commit/a0989ce4263a7d1b2330465623cecedf5b28772e) | 2026-11-02 | 巡检协同中心 |
| [`204966a`](https://github.com/core567/Tidwatch/commit/204966ada213d94ae9d11071be59339658d245bb) | 2026-11-03 | 事件复盘中心与 PDF 报告 |
| [`d5e030d`](https://github.com/core567/Tidwatch/commit/d5e030d76ff614db9e18a0986fb235f2f5effe6c) | 2026-11-03 | AI 助手独立页面 |
| [`98354e5`](https://github.com/core567/Tidwatch/commit/98354e59e888af9ddf6dbbeec752d251a032d54f) | 2026-11-04 | 视觉融合与业务对齐 |

### 2.8 人工纠偏与功能补强（2026-11-04 ~ 11-05）

| 提交 | 日期 | 说明 |
|---|---|---|
| [`9949b6f`](https://github.com/core567/Tidwatch/commit/9949b6fab52e5797613ffa1b5a944a6cfc0a5217) | 2026-11-04 | 屏幕空间节点标签、LOD、遮挡、防重叠、异常分级 |
| [`40d132a`](https://github.com/core567/Tidwatch/commit/40d132ab55f1d12edcb817dacd3bbd2ea8623cfd) | 2026-11-04 | F8 异常模拟场景与恢复修复 |
| [`897a5fc`](https://github.com/core567/Tidwatch/commit/897a5fca2084713bcaf402d6d50f7f1fef9c0607) | 2026-11-05 | 小程序顶部信息层级精简 |
| [`9825959`](https://github.com/core567/Tidwatch/commit/9825959b37c20d28bb59dfc80e94b95fbfde1507) | 2026-11-05 | 巡检弹窗输入焦点与高度修复 |
| [`8e3181f`](https://github.com/core567/Tidwatch/commit/8e3181f6dcf21fff931cd2cb153bf995c79e3d1b) | 2026-11-05 | 巡检弹窗主题作用域与对比度 |
| [`607fb40`](https://github.com/core567/Tidwatch/commit/607fb4068939dcb5eb6fe8bcb375169d6235aed1) | 2026-11-05 | 全局异常告警中心 |
| [`2fa77e2`](https://github.com/core567/Tidwatch/commit/2fa77e2918f60ac9a6d5accc2039692e29deec72) | 2026-11-05 | 数字孪生初始视角恢复 |
| `bc1000a`（本地提交，推送后可在 GitHub 查看） | 2026-11-05 | PDF 中文字体替换：Noto Sans SC（OFL 1.1），移除 SimHei |

---

## 3. 三个纠偏案例的提交索引

| 案例 | 提交 | 核心文件 | 验证证据 |
|---|---|---|---|
| 3D 节点可视化 | [`9949b6f`](https://github.com/core567/Tidwatch/commit/9949b6fab52e5797613ffa1b5a944a6cfc0a5217) | `MonitorNode.tsx`、`NodeLabelOverlay.tsx`、`NodeLabelProjector.tsx`、`nodeVisual.ts`、`NodeAlertEffects.tsx`、`TwinV2Page.tsx`、`twin.css`、`scene.css` | 3D/相机单测 60 项通过 |
| 小程序顶部层级 | [`897a5fc`](https://github.com/core567/Tidwatch/commit/897a5fca2084713bcaf402d6d50f7f1fef9c0607) | `miniprogram/pages/_singlepage/index.*`、`shell-monitor.*`、`shell-notify.wxss` | 小程序单测 55 项与 WXSS/WXML 检查通过 |
| 巡检弹窗输入 | [`9825959`](https://github.com/core567/Tidwatch/commit/9825959b37c20d28bb59dfc80e94b95fbfde1507) | `Drawer.tsx`、`Modal.tsx`、`CreateTaskModalV2.tsx`、`assessment.css`、`inspection.css` | 隔离环境运行验证 |
| 巡检弹窗主题 | [`8e3181f`](https://github.com/core567/Tidwatch/commit/8e3181f6dcf21fff931cd2cb153bf995c79e3d1b) | `Drawer.tsx`、`Drawer.css` | 隔离环境运行验证 |

### 3.1 修复顺序与提交顺序差异（如实记录）

| 顺序 | 实际发生 | Git 表现 |
|---|---|---|
| 1 | 发现弹窗文字颜色/对比度问题，完成主题作用域修复 | 当时未提交，留在工作区 |
| 2 | 发现输入仍异常，定位到焦点抢占与 flex 高度问题 | 提交 `9825959`（19:27） |
| 3 | 补交第一轮主题修复并补充按钮颜色 | 提交 `8e3181f`（20:53，父提交 `9825959`） |

因此 Git 顺序为「先输入修复、后主题修复」，实际工作顺序相反。材料中不得写成同一轮完成。

---

## 4. 关键验证记录

- 后端测试（排除外部 Broker 故障矩阵）：165 passed（2026-11-05）。
- 前端：typecheck / build 通过；3D 单测 60 passed；告警单测 14 passed。
- 小程序：55 passed；WXSS 34 文件 0 错误；WXML 平衡通过。
- PDF 字体替换：Noto Sans SC Regular/Bold 嵌入，9 页报告无空页、无缺字；typecheck/build 通过。
- 故障矩阵、e2e 场景、真机、AI 外部模型、第三方复现：未验证（详见 `docs/contest/REPRODUCE.md`）。

---

## 5. 未纳入仓库的内容

- `contest_materials/`（内部审计材料）、`handoff/`（截图与评审材料）。
- 临时脚本、小程序试验配置、未被引用的 `NodeMarkerSprite.tsx`。
- `.env`、数据库、上传附件、构建产物。

这些内容未提交，不影响仓库复现；详见 README 第 15 节与 `.gitignore`。
