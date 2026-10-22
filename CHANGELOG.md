# Changelog

本项目变更记录。版本号与里程碑（M0–M4）对应。

## [M2] - 2026-10-22

### 异常检测与事件（后端）
- 滑动窗口变化检测：连续 2 点超教学阈值才确认（去抖），连续 3 点正常才恢复
- 活动事件服务：ChangeEvent→ActiveEvent（TW-xxx）、8 态状态机接线、
  范围版本（A→B→C）、跨断面时序关系（仅 OBSERVED_SEQUENCE，非因果）、
  下游观察重点（Focus）、恢复流程、Run Trace；重启从历史重建检测器
- 事件 REST：列表/详情/人工操作（非法迁移 409）
- 全链路统一 UTC，修复 +08:00 与 naive 时间混用导致的时序错误
- MQTT 入库经 on_processed 钩子驱动事件；MQTT client_id 可配置

### 场景
- simulator 新增 S2（A→B）、S3（A→B→C）：固定 seed + 虚拟时钟，
  倍速演示时跨断面时序关系依然成立
- 真实 broker 端到端回归脚本 `scripts/e2e_scenarios.py`：
  S1 零事件、S2 单事件 A/B + 540s 时序关系

### PC Web
- P03 异常事件中心：筛选、状态徽标、范围/版本、SSE 实时
- P04 演化研判工作台：事件信息、时序关系（非因果提示）、状态迁移史、
  8 个人工处置动作、409 错误反馈
- P07 3D：相机平滑飞行（同一场景不重建）、节点高亮、异常红色脉冲、
  节点详情面板（与 P02 同源）、返回全景
- 后端测试 73 passed；新增 threeD 单测 7 个

## [M0] - 2026-10-21

### 工程基线
- 仓库以 `main` 初始化；建立 backend / frontend / miniprogram / simulator / data / docs 目录
- 统一 `.gitignore`（venv/node_modules/.env/数据库/缓存）与 `.gitattributes`（LF 入库）

### 后端（FastAPI + Python 3.12 + SQLite）
- 24 张领域表：观测（含幂等唯一键）、官方月报独立区、变化/活动事件、范围版本、
  状态迁移、时序关系、证据、假设、观察重点、盲区、再评估版本、巡检任务、运行轨迹、
  复盘、用户、规则配置、场景运行、模型输出、知识条目、附件
- Pydantic 契约：camelCase 进出、严格校验；MQTT 多指标快照入站消息（无 status 字段，状态后端计算）
- 规则引擎 `demo-rules-v1`：教学阈值判级（水位优先）+ 8 态事件状态机（非法迁移拒绝）
- REST：`/api/health`、`/api/auth/login`（bcrypt + JWT）
- 实时：SSE `/api/stream` 与 WebSocket `/api/ws` 共享推送 Hub
  （200 条历史、resumeFrom 补放、心跳、慢客户端断开）
- 统一错误结构 `{code, message, details, requestId}`
- 脚本：init_db / seed_data（幂等）/ reset_db；种子账号、逻辑监测点 A/B/C、指标字典
- 测试：28 passed（C02 回归数据、边界、状态机非法迁移、契约、health/login/SSE/WS）

### PC Web（React 18 + TS + Vite）
- 12 页路由（P01–P12）+ 主布局（侧边导航、全局状态条、真实后端健康指示）
- apiClient（统一错误/401）、SSE 客户端（重连/补放/幂等）、Zustand 鉴权、TanStack Query
- 设计 token：深蓝/科技蓝/浅灰，语义色配文字标签
- 已装 R3F/drei/three（M1 3D 使用）；P01/P12 接入真实 health，其余为标注里程碑占位
- typecheck 零错误，生产构建通过

### 微信小程序（原生 TS，独立工程）
- 9 个页面（登录/任务/详情/记录拍照/事件/监测点/我的）+ 来源标签组件
- wx.request 封装（JWT/统一错误/401）、WebSocket 单例（心跳/退避重连/resume/幂等）
- `npx tsc --noEmit` 通过；AppID 由开发者在工具内填入测试号，工程内不写死

### 已知限制
- MQTT ingestor、场景模拟器、月报导入接口、3D 场景尚未实现（M1）
- 小程序业务接口待 M3 对接，当前页面在后端缺失接口时显示规范错误/占位态
