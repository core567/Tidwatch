# TideWatch 复现服务启动（PowerShell 5.1+）
# 复现口径：Uvicorn 不带 --reload（单进程、无文件监听开销，且 PID 可干净回收）。
# 注意：本脚本仅用于复现/验证，不改变开发者日常使用的 --reload 启动方式（见 README 开发说明）。
# 前端直接用 node 启动 vite.js（单 node 进程，便于按 PID 停止），而非 npm 套壳。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/repro/start-services.ps1
# 退出码：0 后端+前端+代理健康检查全部通过；1 启动或健康检查失败。

param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [int]$HealthTimeoutSeconds = 90
)

. "$PSScriptRoot\common.ps1"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$venvPython = Join-Path $backendDir '.venv\Scripts\python.exe'
$viteJs = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
$runDir = Join-Path $repoRoot '.repro-cache\run'
$logDir = Join-Path $runDir 'logs'
New-Item -ItemType Directory -Force -Path $runDir, $logDir | Out-Null

foreach ($need in @($venvPython, $viteJs)) {
    if (-not (Test-Path $need)) { Write-Phase 'ERROR' "缺少 $need，请先完成依赖安装"; exit 1 }
}

# 若已有残留进程/PID，先提示停止
if ((Test-Path (Join-Path $runDir 'backend.pid')) -or (Test-Path (Join-Path $runDir 'frontend.pid'))) {
    Write-Phase 'WARN' '检测到旧的 PID 文件，建议先运行 stop-services.ps1 清理。'
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()

# ---- 后端：uvicorn 无 --reload ----
$beOut = Join-Path $logDir 'backend.out.log'
$beErr = Join-Path $logDir 'backend.err.log'
Write-Phase 'BACKEND' "启动 uvicorn（无 --reload）端口 $BackendPort"
$be = Start-Process -FilePath $venvPython `
    -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$BackendPort") `
    -WorkingDirectory $backendDir -RedirectStandardOutput $beOut -RedirectStandardError $beErr `
    -WindowStyle Hidden -PassThru
$be.Id | Out-File -FilePath (Join-Path $runDir 'backend.pid') -Encoding ascii
Write-Phase 'BACKEND' "PID=$($be.Id)，日志 $beOut"

# ---- 前端：node vite.js ----
$feOut = Join-Path $logDir 'frontend.out.log'
$feErr = Join-Path $logDir 'frontend.err.log'
Write-Phase 'FRONTEND' "启动 vite 端口 $FrontendPort"
$fe = Start-Process -FilePath 'node.exe' `
    -ArgumentList @($viteJs, '--port', "$FrontendPort", '--strictPort') `
    -WorkingDirectory $frontendDir -RedirectStandardOutput $feOut -RedirectStandardError $feErr `
    -WindowStyle Hidden -PassThru
$fe.Id | Out-File -FilePath (Join-Path $runDir 'frontend.pid') -Encoding ascii
Write-Phase 'FRONTEND' "PID=$($fe.Id)，日志 $feOut"

# ---- 健康检查轮询（带超时）----
Write-Phase 'HEALTH' '等待服务就绪...'
$hc = & "$PSScriptRoot\health-check.ps1" -BackendPort $BackendPort -FrontendPort $FrontendPort -TimeoutSeconds $HealthTimeoutSeconds
$hcRc = $LASTEXITCODE
$sw.Stop()
Write-Phase 'TIMING' "服务启动到健康检查完成：$(Get-ElapsedSeconds $sw) 秒"

if ($hcRc -eq 0) {
    Write-Phase 'RESULT' "服务已就绪：前端 http://localhost:$FrontendPort ，后端 http://127.0.0.1:$BackendPort"
    Write-Phase 'RESULT' "停止服务请运行：scripts/repro/stop-services.ps1"
    exit 0
} else {
    Write-Phase 'RESULT' '健康检查失败，输出后端错误日志末尾：'
    if (Test-Path $beErr) { Get-Content $beErr -Tail 20 | ForEach-Object { Write-Host "  $_" } }
    exit 1
}
