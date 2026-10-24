# Changelog

本项目变更记录。版本号与里程碑（M0–M4）对应。

## [M4] - 2026-10-24

### 联调测试 / 故障矩阵
- 真实 Mosquitto 端到端回归 S1–S5（scripts/e2e_scenarios.py）：
  S1 零事件 / S2 A/B+540s / S3 A/B/C / S4 不扩展+假设降级 / S5 盲区
- 故障矩阵 D1–D5 自动化（tests/test_failure_matrix.py）：
  坏 JSON、未知断面、重复、乱序/迟到、超量程、断站 STALE
- 修复：SSE 消息枚举缺失（blindspot/focus）、看门狗误判迟到数据
  （新增 Reach.last_received_at 链路时间列）

### 场景控制台（P12）
- 管理员一键启动 S1–S5（子进程经真实 MQTT 链路）、状态/停止
- 修复 threading.Lock 自死锁（改 RLock）、Windows Popen PIPE 死锁（文件重定向）

### 语音现场感知（P11）
- 小程序接入微信同声传译，按住说话转写并标注来源；
  插件缺失/失败显式降级为手动输入，不伪造识别结果
- 规则 vs ML 面板（M3）、研判单打印（M3）

### 工程
- scikit-learn 加入依赖；后端 102 passed；三端类型检查通过
- 测试库内存 SQLite + StaticPool，消除并发锁

## [M3] - 2026-10-24

### 研判闭环（后端）
- 证据六来源×三性（支持/反证/缺失）、假设五状态，结论强度不超过证据
- 再评估版本：范围差异、Focus 联动、假设快照、任务建议
- S4 反例：C 窗口内稳定→不扩展、传播假设降级 NOT_SUPPORT
- 监测盲区：LWT/陈旧形成 BlindSpot，盲区存在时事件禁止恢复
- S5：观察点离线→迟到补数（双时间戳）→解除盲区→受控再评估
- 巡检任务：Focus 自动派发、接受/开始/回填，回填转 MANUAL 证据并触发再评估
- 研判单聚合（范围史/证据/假设/版本/未解决项/轨迹，可打印导出）
- 规则 vs ML：IsolationForest 历史分布评分，独立 model_outputs，不驱动状态机；样本不足不臆测

### PC Web / 小程序
- P05 任务中心（派发/跟踪/回填结论）、P06 证据库+假设+规则/ML 对照
- P04 增加证据链与假设面板；P08 研判单打印页；P09 月报与事件频次统计
- 小程序任务接口对齐真实后端（含拍照上传端点）
- 测试库改为内存 SQLite + StaticPool，消除并发锁；后端 93 passed

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
