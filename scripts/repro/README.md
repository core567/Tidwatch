# TideWatch 复现工具集（Windows PowerShell 5.1+）

面向第三方在**全新隔离环境**复现 TideWatch。所有脚本兼容 Windows 自带的
Windows PowerShell 5.1（无需安装 PowerShell 7），不依赖 VSClaude 专属配置、
全局 pip/npm 缓存或任何个人环境变量。镜像与官方源均由参数显式控制。

## 设计口径

- **冷启动 Cold（主要指标）**：新建一对**空的**独立 pip/npm 缓存目录 + 全新 venv + 全新 node_modules，
  脚本显式传 `--cache-dir`/`--cache`，**不读取**本机 `%LocalAppData%\pip\cache` 与 `npm-cache`。
- **温启动 Warm（辅助对照）**：复用某次 Cold 已填充的缓存目录，但仍新建 venv 与 node_modules
  （重装，包主要来自缓存而非网络）。两者日志分目录保存，禁止混算。
- 后端始终安装 `requirements-lock.txt` 精确版本；前端始终用 `npm ci`（不用 `npm install`）。
- 复现启动 Uvicorn **不带 `--reload`**；开发者日常的 `--reload` 启动方式不变（见项目 README）。
- 数据库 `init_db.py`（建表）与 `seed_data.py`（种子）两个必要步骤都保留，不合并、不跳过。

## 脚本清单

| 脚本 | 作用 |
|---|---|
| `common.ps1` | 公共函数：阶段日志、重试、HTTP 轮询、Python/浏览器定位（被其他脚本 dot-source，不单独运行） |
| `fetch-source.ps1` | 源码获取：官方 codeload 优先 → 可选镜像（`-MirrorUrl`，不传则跳过）→ git 浅克隆兜底；每次下载记录来源/HTTP/字节/耗时并做 gzip 与内容完整性校验，写 `fetch-report.json` |
| `install-deps.ps1` | 后端 pip 与前端 npm **并行**安装，独立缓存区分冷/温 |
| `init-db.ps1` | 自动补 `.env`，依次运行 init_db.py、seed_data.py 并分别计时 |
| `start-services.ps1` | 无 `--reload` 启动 uvicorn、node 启动 vite，随后轮询健康检查 |
| `health-check.ps1` | 带超时轮询：后端 health JSON、前端入口 HTML、Vite 代理链路三项 |
| `stop-services.ps1` | 按 PID 干净停止前后端进程 |
| `run-repro-timing.ps1` | **A 核心复现计时编排**：逐阶段 Stopwatch、环境/缓存信息、退出码、原始日志、`timing-cold/warm.json`、核心路由检查与总览无头截图 |
| `run-regression-timing.ps1` | **B 扩展回归计时编排**：pytest/typecheck/build/3D/告警/小程序逐阶段计时，写 `timing-regression.json` |
| `verify-render.mjs` | **真实浏览器渲染校验**（零依赖，用已装 Edge/Chrome 的 CDP）：等待 React 渲染后对 5 条路由取差异化截图与渲染后 DOM，写 `render/render-report.json`，需 Node ≥ 22 |
| `upload-archive-to-release.ps1` | 历史截图归档包上传 GitHub Release 的助手（无 gh/token 时打印手动步骤） |

## 标准复现流程（在仓库根目录执行）

```powershell
# 0) 一次性放开当前进程的脚本执行策略（仅影响本窗口）
Set-ExecutionPolicy -Scope Process -Bypass

# 1) 获取源码到全新空目录（三种通道自动兜底）
powershell -ExecutionPolicy Bypass -File scripts/repro/fetch-source.ps1 -TargetDir D:\iso\Tidwatch
cd D:\iso\Tidwatch

# 2) 并行安装依赖（冷启动，独立空缓存；默认清华 PyPI + npmmirror）
powershell -ExecutionPolicy Bypass -File scripts/repro/install-deps.ps1 -Mode Cold

# 3) 数据库初始化（保留 init_db + seed_data 两步）
powershell -ExecutionPolicy Bypass -File scripts/repro/init-db.ps1

# 4) 启动服务并自动健康检查（uvicorn 无 --reload）
powershell -ExecutionPolicy Bypass -File scripts/repro/start-services.ps1

# 5) 浏览器验证后停止
powershell -ExecutionPolicy Bypass -File scripts/repro/stop-services.ps1
```

## 源与镜像备用

| 场景 | 做法 |
|---|---|
| 默认（国内网络） | pip 清华源、npm npmmirror，脚本默认即是 |
| 镜像不可用，切官方源 | `install-deps.ps1 -Mode Cold -Official`（pypi.org + registry.npmjs.org） |
| GitHub 下载失败 | `fetch-source.ps1` 默认官方 codeload 重试，失败再走 git 浅克隆；**不内置固定镜像**，需要时显式 `-MirrorUrl https://<你的镜像>`，镜像不可用会自动跳过 |
| 只用手动命令 | 见 `docs/contest/REPRODUCE.md` 的“逐条手动命令”章节 |

## A/B 计时编排（落盘证据）

```powershell
# A 核心复现（冷）：全新 TargetDir 由 -DoSourceFetch 网络获取；也可先备好隔离源码后不带该参数
powershell -File scripts/repro/run-repro-timing.ps1 -Mode Cold -WorkRoot D:\iso-runs -DoSourceFetch
# A 核心复现（温）：复用冷启动缓存目录，仍重建 venv/node_modules、重新初始化数据库
powershell -File scripts/repro/run-repro-timing.ps1 -Mode Warm -WorkRoot D:\iso-runs `
  -ReuseCacheDir D:\iso-runs\evidence-cold-<ts>\cache\cold-<ts> -TargetDir D:\iso-runs\Tidwatch-warm
# B 扩展回归（在已装好依赖的隔离目录上，单独计时）
powershell -File scripts/repro/run-regression-timing.ps1 -TargetDir <隔离目录> -EvidenceDir D:\iso-runs\evidence-reg
```

每个 evidence 目录产出：`env-info.json`（OS/PowerShell/Python/Node/npm/源/缓存目录）、
`timing-cold.json` / `timing-warm.json` / `timing-regression.json`（逐阶段开始/结束/耗时/退出码）、
`cache-info.json`（缓存目录文件数，证明冷启动初始为 0）、`core-pages.json`（路由与 API 检查）、
`fetch-report.json`（每次下载的来源/HTTP/字节/耗时/完整性）、`render/render-report.json` 与
`render/screenshots/`（CDP 5 路由真实渲染、互不相同的截图）、`logs/` 原始日志。

> **浏览器渲染校验（CDP）**：无头 one-shot 的 `--screenshot`/`--dump-dom` 在首帧即抓取，SPA 客户端路由
> 尚未渲染，对不同路由产出相同外壳，且持久 SSE 会让 `--virtual-time-budget` 死锁。因此正式校验改用
> `verify-render.mjs`：通过已装 Edge/Chrome 的 DevTools Protocol，`Page.navigate` 后等待 `#root` 渲染出
> 足够内容，再对 `/`、`/monitor`、`/events`、`/tasks`、`/review` 各取真实截图与 innerText，产出 5 张互不相同
> （哈希不同）的页面证据，结果在 `render/render-report.json`。需要 Node ≥ 22（内置 WebSocket）；
> 不满足时编排器如实跳过并提示用真实浏览器人工检查，不用重复截图冒充不同页面。

## 冷/温对照

```powershell
# 冷启动（结束日志会打印本次缓存目录，形如 .repro-cache\cold-20261112-xxxxxx）
powershell -File scripts/repro/install-deps.ps1 -Mode Cold
# 温启动：复用上面那次缓存，但仍重建 venv/node_modules
powershell -File scripts/repro/install-deps.ps1 -Mode Warm -ReuseCacheDir .\.repro-cache\cold-20261112-xxxxxx
```

## 日志与产物

- 依赖安装日志、退出码：`.repro-cache\<run>\logs\`
- 服务运行日志：`.repro-cache\run\logs\`，PID：`.repro-cache\run\*.pid`
- `.repro-cache/` 已加入 `.gitignore`，不会入库。

## npm 11 的 esbuild 提示（警告而非错误）

npm 11 对带安装脚本的依赖会提示
`install-scripts not yet covered by allowScripts: esbuild@... (postinstall)`。
本项目 esbuild 的平台二进制通过 `@esbuild/win32-x64` 平台包提供，**该提示不阻断安装**，
`npm ci` 退出码为 0、`vite` 可正常运行。只有当 `npm ci` 退出码非 0 才是真正失败。
