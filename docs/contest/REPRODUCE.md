# TideWatch 第三方交叉复现记录

> 目的：让未参与开发的第三方在**全新隔离环境**按统一步骤独立复现，并如实记录结果。
> **当前状态：第二轮优化的工具集与流程已就绪，官方冷/温启动实测待执行（见第 2 节计时口径）。**
> 结果栏默认「未验证」；维护者彩排记录见 `D:\TideWatch-archive\2026-11-12-repro-optimization\evidence\`（本地证据，不等同第三方复现）。

---

## 0. 计时口径与基线（务必先读）

### 0.1 两类时间，分别计时，不得混算

- **A. 核心复现耗时（主要指标，目标 ≤ 10 分钟）**：从全新环境**获取源码**开始，
  到依赖安装、数据库初始化、前后端启动、健康检查、首页与核心功能验证完成。包含：
  源码获取 / Python 安装 / npm 安装 / 数据库初始化 / 服务启动与健康检查 / 核心页面验证。
- **B. 扩展回归测试耗时（单独计时，不计入 A）**：后端 pytest、前端 typecheck/build、
  3D 单测、告警单测、小程序测试等。跑再久也不得为了 A 达标而跳过。

### 0.2 冷启动 vs 温启动（缓存口径严格区分）

- **冷启动 Cold（主要复现指标）**：全新空目录 + 全新 venv/node_modules + **独立空缓存目录**
  （pip `--cache-dir`、npm `--cache` 指向新建空目录），**不复用**本机 `%LocalAppData%\pip\cache`、`npm-cache`。
- **温启动 Warm（辅助对照）**：复用某次 Cold 已填充的缓存目录，但仍新建 venv 与 node_modules
  （重装，包主要来自缓存而非网络）。两份日志分目录保存，禁止用温启动结果冒充冷启动。

### 0.3 历史基线（22 分 08 秒，保留但说明证据现状）

上一轮 VSClaude 隔离复现记录为 **22 分 08 秒**（源码获取约 16 分钟，其中 codeload 下载约 12 分 42 秒；
Python 约 2 分 48 秒；npm 约 54 秒且命中本机缓存；数据库约 5 秒；启动验证约 2 分钟）。
**如实说明：该轮未留存可核验的原始逐步骤计时日志文件，以上数字来自当时对话/口头记录，
不是完整日志实测，不得当作有日志佐证的数据引用。** 本轮所有计时都将落盘保存原始日志。

---

## 1. 复现信息登记

| 项 | 填写内容 |
|---|---|
| 复现人 | 待填写 |
| 复现日期 | 待填写 |
| 操作系统与版本 | 待填写 |
| PowerShell 版本（Windows） | 待填写（要求 5.1+；`$PSVersionTable.PSVersion`） |
| Python 版本 | 待填写（要求 3.12） |
| Node.js / npm 版本 | 待填写（要求 Node 20+） |
| 浏览器与版本 | 待填写（3D 需 WebGL） |
| MQTT Broker | 无 / Mosquitto 版本：待填写 |
| 微信开发者工具版本 | 无 / 待填写 |
| 复现分支 | `fusion/f2-overview-migration` |
| 复现 Commit | 运行时 `git rev-parse HEAD` 实际哈希（fetch-source 会尝试从 API 记录） |
| 缓存口径 | **冷启动 / 温启动（二选一，禁止混填）** |
| 数据库路径 | 默认 `data/tidewatch.db` / 自定义：待填写 |
| 使用的源 | PyPI：清华 / 官方；npm：npmmirror / 官方；源码：codeload / 镜像 / git 浅克隆 |

---

## 2. 核心复现步骤（对应计时 A）

> 有两种等价执行方式：**方式一（推荐）**用 `scripts/repro/` 工具集，自动并行、计时、健康轮询；
> **方式二**逐条手动命令，便于逐步核对。两者结果等效。脚本仅支持 Windows PowerShell 5.1+；
> macOS/Linux 请用方式二的跨平台命令。

### 2.0 方式一：PowerShell 工具集（Windows）

```powershell
Set-ExecutionPolicy -Scope Process -Bypass

# 1) 源码获取到全新空目录（官方 codeload → 镜像 codeload → git 浅克隆，自动兜底）
powershell -ExecutionPolicy Bypass -File scripts/repro/fetch-source.ps1 -TargetDir D:\iso\Tidwatch
cd D:\iso\Tidwatch

# 2) 冷启动并行安装（独立空缓存；默认清华 PyPI + npmmirror）
powershell -ExecutionPolicy Bypass -File scripts/repro/install-deps.ps1 -Mode Cold
#    镜像不可用切官方源：追加  -Official
#    温启动对照：-Mode Warm -ReuseCacheDir <上一步结束日志打印的 cold-* 目录>

# 3) 数据库初始化（自动补 .env；依次运行 init_db.py、seed_data.py，不合并不跳过）
powershell -ExecutionPolicy Bypass -File scripts/repro/init-db.ps1

# 4) 启动服务并自动健康检查（uvicorn 无 --reload；后端 JSON、前端入口、Vite 代理三项轮询）
powershell -ExecutionPolicy Bypass -File scripts/repro/start-services.ps1

# 5) 用完停止
powershell -ExecutionPolicy Bypass -File scripts/repro/stop-services.ps1
```

脚本设计与故障处理见 [scripts/repro/README.md](../../scripts/repro/README.md)。
所有日志在 `.repro-cache/<run>/logs/`，该目录已 gitignore。

### 2.1 方式二：逐条手动命令

#### 2.1.1 代码获取（三种通道，按序兜底）

```powershell
# 通道 1：官方 codeload tar.gz（实测本环境 git smart-http 可能被重置，codeload 更稳）
curl.exe -L --fail --retry 2 -o tidewatch.tar.gz `
  https://codeload.github.com/core567/Tidwatch/tar.gz/refs/heads/fusion/f2-overview-migration
tar -xzf tidewatch.tar.gz
# 解压出 Tidwatch-<branch>/ 目录，重命名为工作目录后进入

# 通道 2（通道 1 失败）：镜像前缀，例如
#   https://gh-proxy.com/https://codeload.github.com/core567/Tidwatch/tar.gz/refs/heads/fusion/f2-overview-migration

# 通道 3（前两者失败）：官方 git 浅克隆（历史很浅，体积与全量接近）
git clone --depth 1 --single-branch --branch fusion/f2-overview-migration https://github.com/core567/Tidwatch.git
```

完整性校验：确认 `backend/requirements-lock.txt`、`frontend/package-lock.json`、`README.md` 均存在。
git 克隆方式用 `git rev-parse HEAD` 记录实际 commit；codeload 包不含 `.git`，以 fetch-source 记录的 API commit 为准。

#### 2.1.2 后端（lock 精确版本 + 镜像/官方备用）

Windows PowerShell：

```powershell
cd backend
py -3.12 -m venv .venv

# 冷启动：独立空缓存（把 $coldCache 指向新建空目录），不使用本机全局缓存
$coldCache = "D:\iso\repro-cache\pip"
# 国内镜像（默认推荐）
.venv\Scripts\python.exe -m pip install --cache-dir $coldCache -r requirements-lock.txt `
  -i https://pypi.tuna.tsinghua.edu.cn/simple
# 官方源备用（镜像不可用时）：去掉 -i 参数，即
# .venv\Scripts\python.exe -m pip install --cache-dir $coldCache -r requirements-lock.txt

Copy-Item .env.example .env     # 默认 MQTT_ENABLED=false，适配无 Broker 复现
.venv\Scripts\python.exe scripts\init_db.py    # 建表（必要，保留）
.venv\Scripts\python.exe scripts\seed_data.py  # 种子（必要，保留）

# 复现口径：不带 --reload（开发环境仍可用 --reload，互不影响）
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

macOS/Linux：`py -3.12` 换 `python3.12`，`.venv\Scripts\python.exe` 换 `.venv/bin/python`。

> 必须安装 `requirements-lock.txt`（51 个精确钉版），不要用宽松的 `requirements.txt` 做正式复现，
> 以保证版本可复现、省去依赖解析。`init_db.py` 与 `seed_data.py` 是两个职责不同的必要步骤，不得合并或跳过。

#### 2.1.3 前端（npm ci，不使用 npm install，不重新生成 lock）

```powershell
cd frontend
$npmCold = "D:\iso\repro-cache\npm"
# 国内镜像（默认推荐）
npm ci --cache $npmCold --registry https://registry.npmmirror.com --no-audit --no-fund
# 官方源备用：去掉 --registry 参数
# npm ci --cache $npmCold --no-audit --no-fund
npm run dev
```

- 正式复现用 `npm ci`：严格按 `package-lock.json`（lockfileVersion 3）安装，不修改 lock。
- **npm 11 的 esbuild 提示是警告不是错误**：出现 `install-scripts not yet covered by allowScripts: esbuild@...`
  时，因平台二进制由 `@esbuild/win32-x64` 提供，安装仍成功、vite 正常；以 `npm ci` 退出码 0 为准，非 0 才是失败。
- 保留现有 `package-lock.json`，不要为换源而重新生成（lock 内同时含 npmmirror 与 npmjs 的 resolved，实测可用）。

#### 2.1.4 pip 与 npm 并行安装（Windows PowerShell 手动法）

不用工具集时，最简单可靠的手动并行是**开两个 PowerShell 窗口**：一个跑 2.1.2 的 pip，
一个跑 2.1.3 的 npm，同时开始、各自等待完成。总耗时取两者较长者，而非相加。
工具集 `install-deps.ps1` 用 `Start-Job` 在单窗口内实现同样的并行。

#### 2.1.5 带超时的健康检查（不要用固定 sleep 干等）

后端、前端启动后，用轮询确认真实就绪。PowerShell：

```powershell
function Wait-Url($url, $expect, $timeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try { $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5
          if (-not $expect -or $r.Content -match [regex]::Escape($expect)) { return $true } } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}
Wait-Url "http://127.0.0.1:8000/api/health" '"status":"ok"'   # 后端
Wait-Url "http://localhost:5173/"            '<div id="root">' # 前端入口
Wait-Url "http://localhost:5173/api/health"  '"status":"ok"'   # Vite 代理到后端
```

Git Bash/macOS/Linux 等价写法：`for i in $(seq 1 45); do curl -sf http://127.0.0.1:8000/api/health && break; sleep 2; done`。

期望后端返回 `{"status":"ok","version":"...","database":"ok"}`。

### 2.2 核心页面与功能验证（计入 A）

| 检查项 | 操作 | 期望 | 状态 |
|---|---|---|---|
| 总览首页 | 打开 `http://localhost:5173/` | 无需登录看到智慧监测总览，控制台无接口错误 | 未验证 |
| 数字孪生 | 打开 `/monitor`（需 WebGL，不支持时降级 2D） | 3D 场景/节点标签可见 | 未验证 |
| 异常事件 | 打开 `/events` | 事件列表可加载（空列表也属正常，结构正确即可） | 未验证 |
| 巡检任务 | 打开 `/tasks` → 新建任务 → 存草稿/派发 | 列表出现 DRAFT/PENDING | 未验证 |
| 复盘入口 | 打开 `/review` | 复盘列表可加载 | 未验证 |
| 后端 API | `GET /api/reaches`、`/api/inspection-tasks`、`/api/admin/diagnostics` | 均 HTTP 200 | 未验证 |
| 全局告警 | 已有事件时等待轮询 | 铃铛未读与历史可用 | 未验证 |
| AI 规则模式 | `/assistant` 提问“当前哪些断面异常” | 返回规则模式答案与来源（未配大模型时为基础助手） | 未验证 |

### 2.3 计时记录表（A 核心复现，逐项实测填写，冷/温各一份）

| # | 分段 | 冷启动实测(s) | 温启动实测(s) | 证据日志路径 |
|---|---|---|---|---|
| 1 | 源码获取 | 待填写 | 不适用（源码不随包缓存） | 待填写 |
| 2 | Python 依赖安装（并行段内） | 待填写 | 待填写 | `.repro-cache/<run>/logs/backend-pip.log` |
| 3 | npm 依赖安装（并行段内） | 待填写 | 待填写 | `.repro-cache/<run>/logs/frontend-npm.log` |
| 4 | 并行安装总墙钟（取较长者） | 待填写 | 待填写 | install-deps 输出 |
| 5 | 数据库初始化（init+seed） | 待填写 | 待填写 | init-db 输出 |
| 6 | 服务启动与健康检查 | 待填写 | 待填写 | start-services 输出 |
| 7 | 核心页面验证 | 待填写 | 待填写 | 待填写 |
| **A 合计** | 核心复现总耗时 | **待填写** | **待填写** | — |

---

## 3. 扩展回归测试（对应计时 B，单独计时，不计入 A）

```powershell
# 后端（排除需要外部 Broker 的故障矩阵）
cd backend
.venv\Scripts\python.exe -m pytest tests --ignore=tests/test_failure_matrix.py

# 前端
cd ..\frontend
npm run typecheck
npm run build
npm run test:3d
npm run test:alerts

# 小程序
cd ..\miniprogram
npm ci
npm test
```

维护者本地基线（2026-11-05，供对照，不作为第三方结论）：后端 165 passed（约 18.4s）；
typecheck/build 通过；3D 60 passed；告警 14 passed；小程序 55 passed。

| 测试项 | 第三方实测结果 | 耗时(s) | 状态 |
|---|---|---|---|
| 后端 pytest（排除故障矩阵） | 待填写 | 待填写 | 未验证 |
| 前端 typecheck | 待填写 | 待填写 | 未验证 |
| 前端 build | 待填写 | 待填写 | 未验证 |
| 3D 单测 | 待填写 | 待填写 | 未验证 |
| 告警单测 | 待填写 | 待填写 | 未验证 |
| 小程序测试 | 待填写 | 待填写 | 未验证 |
| **B 合计** | — | 待填写 | — |

---

## 4. 可选场景（不计入核心复现时间）

### 4.1 无 Broker 演示观测回填

```powershell
cd backend
.venv\Scripts\python.exe scripts\seed_demo_observations.py --days 3 --interval-min 5
```

### 4.2 有 Broker 场景（需 Mosquitto）

```powershell
mosquitto -v                       # 1) 启动 Broker（默认 1883）
# 2) backend/.env 设 MQTT_ENABLED=true 后重启后端
cd simulator
..\backend\.venv\Scripts\python.exe run_scenario.py --scenario S2 --speed 4
```

期望：观测入站、事件生成、SSE 推送、全局告警联动。故障矩阵 `tests/test_failure_matrix.py`
需独立 Broker，避免污染演示库。

### 4.3 官方月报导入

`/admin` → 月报导入 → 上传 `data/samples/wuhan_surface_water_2026-07_hanjiang.csv`
→ 预览 → 确认 → 查看批次 →（可选）撤销。

### 4.4 小程序（可选）

微信开发者工具导入 `miniprogram/`，测试号 AppID，勾选「不校验合法域名、TLS」；
模拟器用 `config/env.ts` 的 `HOST=127.0.0.1`，真机改局域网 IP 且后端 `--host 0.0.0.0`。

---

## 5. 结果记录表

| # | 步骤 | 实际结果 | 与期望差异 | 状态 | 证据（日志/截图路径） |
|---|---|---|---|---|---|
| 1 | 代码获取 | 待填写 | 待填写 | 未验证 | 待填写 |
| 2 | 后端健康检查 | 待填写 | 待填写 | 未验证 | 待填写 |
| 3 | 前端首屏与核心页面 | 待填写 | 待填写 | 未验证 | 待填写 |
| 4 | 冷/温缓存口径 | 待填写 | 待填写 | 未验证 | 缓存目录文件数截图/日志 |
| 5 | 后端测试 | 待填写 | 待填写 | 未验证 | 待填写 |
| 6 | 前端测试与构建 | 待填写 | 待填写 | 未验证 | 待填写 |
| 7 | 小程序测试 | 待填写 | 待填写 | 未验证 | 待填写 |
| 8 | 有 Broker 场景（可选） | 待填写 | 待填写 | 未验证 | 待填写 |
| 9 | 月报导入 | 待填写 | 待填写 | 未验证 | 待填写 |

---

## 6. 复现结论

- 总体结论：**未验证**（第二轮官方冷/温实测待执行）。
- 阻塞项：待填写。
- 建议修复项：待填写。
- 复现人签字 / 日期：待填写。

---

## 7. 已知限制（复现前必读）

1. 本地演示免登录、接口无鉴权，仅限本地/受控环境。
2. 官方连续实时接口未接入；官方快照默认关闭，可能因网络或平台限制失败。
3. AI 大模型需自行配置外部服务；未配置时只有规则模式。
4. 3D 页面需要 WebGL；不支持时自动降级为 2D 示意层。
5. 浏览器告警声音需用户手势解锁，刷新后可能要重新开启。
6. 小程序真机需局域网、防火墙放行与开发者工具设置；扫码预览受测试号域名限制。
7. 历史截图（stage-* 等 106 张）已移出主分支以减小克隆体积，可由提交 `8214b71` 或离线归档包恢复，详见 README 第 15 节。
8. 网络是源码获取耗时的主要不确定因素：实测 GitHub bulk 带宽可能仅数百 KB/s 且 git smart-http 可能被重置；
   请如实记录当时通道与速率，不得把一次性好网络当作普遍结论。
