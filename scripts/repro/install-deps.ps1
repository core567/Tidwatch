# TideWatch 后端 + 前端依赖并行安装（PowerShell 5.1+）
#
# 关键口径（冷/温缓存严格区分，绝不复用本机全局 pip/npm 缓存）：
#   -Mode Cold（默认）：在独立缓存根下新建一对【空】pip/npm 缓存目录，全新 venv + 全新 node_modules。
#   -Mode Warm -ReuseCacheDir <某次 Cold 的缓存目录>：复用该次已填充缓存，
#                 但仍新建 venv 与 node_modules（重装，包主要来自缓存而非网络）。
# 两种模式都显式传 --cache-dir / --cache，因此不读取 %LocalData%\pip\cache 与 npm-cache。
#
# 后端始终用 requirements-lock.txt 精确版本；前端始终用 npm ci（不用 npm install）。
# 镜像默认清华 PyPI + npmmirror；-Official 切换官方源 pypi.org + registry.npmjs.org。
#
# 用法：
#   冷启动（默认镜像）：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/install-deps.ps1 -Mode Cold
#   温启动（复用冷启动缓存，目录名见冷启动结束日志）：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/install-deps.ps1 -Mode Warm -ReuseCacheDir .\.repro-cache\cold-20261112-xxxxxx
#   官方源备用：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/install-deps.ps1 -Mode Cold -Official
#
# 安全：若 backend\.venv 或 frontend\node_modules 已存在则拒绝执行（除非加 -Force），
#       避免覆盖开发环境。隔离测试应在全新克隆目录中运行，天然不存在这两个目录。
# 退出码：0 两端均成功；1 任一失败；2 参数错误；3 环境已存在且未加 -Force；4 venv 创建失败。

param(
    [ValidateSet('Cold', 'Warm')][string]$Mode = 'Cold',
    [string]$CacheRoot = '',
    [string]$ReuseCacheDir = '',
    [switch]$Official,
    [switch]$Force
)

. "$PSScriptRoot/common.ps1"

# ---- 路径解析（脚本位于 <repo>/scripts/repro）----
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
if ([string]::IsNullOrEmpty($CacheRoot)) { $CacheRoot = Join-Path $repoRoot '.repro-cache' }

# ---- 源选择：镜像 vs 官方，均显式给出，不依赖全局配置 ----
if ($Official) {
    $pipIndex = 'https://pypi.org/simple'
    $npmRegistry = 'https://registry.npmjs.org'
} else {
    $pipIndex = 'https://pypi.tuna.tsinghua.edu.cn/simple'
    $npmRegistry = 'https://registry.npmmirror.com'
}

$venvPython = Join-Path $backendDir '.venv\Scripts\python.exe'
$lockFile = Join-Path $backendDir 'requirements-lock.txt'

# ---- 开发环境保护（在创建任何缓存目录之前判定）：已存在 venv/node_modules 时拒绝，除非 -Force ----
if ((Test-Path $venvPython) -or (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    if (-not $Force) {
        Write-Phase 'ERROR' '检测到 backend\.venv 或 frontend\node_modules 已存在。为避免覆盖开发环境，本脚本拒绝执行。'
        Write-Phase 'ERROR' '隔离复现请在全新克隆目录运行；确需在此重建，请显式加 -Force。'
        exit 3
    }
    Write-Phase 'WARN' '-Force 已指定，将移除既有 backend\.venv 与 frontend\node_modules'
    if (Test-Path (Join-Path $backendDir '.venv')) { Remove-Item -Recurse -Force (Join-Path $backendDir '.venv') }
    if (Test-Path (Join-Path $frontendDir 'node_modules')) { Remove-Item -Recurse -Force (Join-Path $frontendDir 'node_modules') }
}

# ---- 冷/温缓存目录 ----
if ($Mode -eq 'Cold') {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $runCache = Join-Path $CacheRoot ("cold-$stamp")
} else {
    if ([string]::IsNullOrEmpty($ReuseCacheDir)) {
        Write-Phase 'ERROR' 'Warm 模式必须通过 -ReuseCacheDir 指定某次 Cold 运行的缓存目录'
        exit 2
    }
    if (-not (Test-Path $ReuseCacheDir)) {
        Write-Phase 'ERROR' "ReuseCacheDir 不存在：$ReuseCacheDir"
        exit 2
    }
    $runCache = (Resolve-Path $ReuseCacheDir).Path
}
$pipCache = Join-Path $runCache 'pip'
$npmCache = Join-Path $runCache 'npm'
$logDir = Join-Path $runCache 'logs'
New-Item -ItemType Directory -Force -Path $pipCache, $npmCache, $logDir | Out-Null

$pipLog = Join-Path $logDir 'backend-pip.log'
$npmLog = Join-Path $logDir 'frontend-npm.log'
$pipExitFile = Join-Path $logDir 'backend.exit'
$npmExitFile = Join-Path $logDir 'frontend.exit'

Write-Phase 'CONFIG' "模式=$Mode 官方源=$Official"
Write-Phase 'CONFIG' "仓库=$repoRoot"
Write-Phase 'CONFIG' "PyPI 源=$pipIndex"
Write-Phase 'CONFIG' "npm 源=$npmRegistry"
Write-Phase 'CONFIG' "pip 独立缓存=$pipCache"
Write-Phase 'CONFIG' "npm 独立缓存=$npmCache"
if ($Mode -eq 'Cold') {
    $pipItems = (Get-ChildItem $pipCache -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    $npmItems = (Get-ChildItem $npmCache -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Phase 'CONFIG' "冷启动缓存目录初始文件数（应为 0）：pip=$pipItems npm=$npmItems"
}

# ---- 后端作业：全新 venv + lock 精确安装，退出码写状态文件 ----
$backendJob = {
    param($backendDir, $venvPython, $lockFile, $pipIndex, $pipCache, $pipLog, $pipExitFile)
    Set-Location $backendDir
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    # PS 5.1 的 Tee-Object 无 -Encoding 参数，统一用 Add-Content（支持 -Encoding utf8）
    function Write-Log([string]$m) { Add-Content -Path $pipLog -Value $m -Encoding utf8 }
    try {
        Write-Log '>>> 创建虚拟环境 py -3.12 -m venv .venv'
        & py.exe -3.12 -m venv .venv
        if ($LASTEXITCODE -ne 0) { Write-Log 'venv 创建失败'; 4 | Out-File -FilePath $pipExitFile -Encoding ascii; exit 4 }
        Write-Log '>>> pip 安装锁定依赖（独立缓存，不用全局缓存）'
        & $venvPython -m pip install --cache-dir $pipCache -r $lockFile -i $pipIndex 2>&1 |
            Out-File -FilePath $pipLog -Append -Encoding utf8
        $code = $LASTEXITCODE
        Write-Log ">>> pip 退出码=$code"
        $code | Out-File -FilePath $pipExitFile -Encoding ascii
        exit $code
    } catch {
        Write-Log "异常：$($_.Exception.Message)"
        1 | Out-File -FilePath $pipExitFile -Encoding ascii
        exit 1
    }
}

# ---- 前端作业：npm ci，退出码写状态文件 ----
$frontendJob = {
    param($frontendDir, $npmRegistry, $npmCache, $npmLog, $npmExitFile)
    Set-Location $frontendDir
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    function Write-Log([string]$m) { Add-Content -Path $npmLog -Value $m -Encoding utf8 }
    try {
        Write-Log '>>> npm ci（独立缓存，不用全局缓存）'
        & npm.cmd ci --cache $npmCache --registry $npmRegistry --no-audit --no-fund 2>&1 |
            Out-File -FilePath $npmLog -Append -Encoding utf8
        $code = $LASTEXITCODE
        Write-Log ">>> npm 退出码=$code"
        $code | Out-File -FilePath $npmExitFile -Encoding ascii
        exit $code
    } catch {
        Write-Log "异常：$($_.Exception.Message)"
        1 | Out-File -FilePath $npmExitFile -Encoding ascii
        exit 1
    }
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$j1 = Start-Job -Name 'backend-pip' -ScriptBlock $backendJob `
    -ArgumentList $backendDir, $venvPython, $lockFile, $pipIndex, $pipCache, $pipLog, $pipExitFile
$j2 = Start-Job -Name 'frontend-npm' -ScriptBlock $frontendJob `
    -ArgumentList $frontendDir, $npmRegistry, $npmCache, $npmLog, $npmExitFile
Write-Phase 'PARALLEL' '后端 pip 与前端 npm 已并行启动，等待两者完成...'
Wait-Job -Job $j1, $j2 | Out-Null
$sw.Stop()
Remove-Job -Job $j1, $j2 -Force

$code1 = if (Test-Path $pipExitFile) { [int](Get-Content $pipExitFile -First 1) } else { 1 }
$code2 = if (Test-Path $npmExitFile) { [int](Get-Content $npmExitFile -First 1) } else { 1 }

Write-Phase 'TIMING' "并行安装总墙钟：$(Get-ElapsedSeconds $sw) 秒"
Write-Phase 'RESULT' "后端 pip 退出码=$code1（日志 $pipLog）"
Write-Phase 'RESULT' "前端 npm 退出码=$code2（日志 $npmLog）"
Write-Phase 'CACHE' "本次运行缓存目录（Warm 复用时传入此路径）：$runCache"

if ($code1 -eq 0 -and $code2 -eq 0) {
    Write-Phase 'RESULT' '两端依赖安装成功'
    exit 0
} else {
    Write-Phase 'RESULT' '依赖安装存在失败项，请查看对应日志'
    exit 1
}
