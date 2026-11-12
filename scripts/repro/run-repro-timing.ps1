# TideWatch 核心复现计时编排（A：核心复现耗时）—— PowerShell 5.1+
#
# 逐阶段用 Stopwatch 记录真实墙钟，采集环境信息、下载来源、缓存目录与初始文件数、
# 每步开始/结束/耗时/退出码，保存原始日志与结构化 timing-<mode>.json。
# 任一核心阶段失败：记录失败原因、写 JSON、清理服务后以非 0 退出，绝不跳过后谎报成功。
#
# 冷启动（Cold）：全新 TargetDir + 全新 venv/node_modules + 独立空缓存 + 全新数据库。
# 温启动（Warm）：重建 venv/node_modules、数据库重新初始化，但复用 Cold 的依赖缓存（-ReuseCacheDir）。
# 两次结果分目录存档，禁止混算。回归测试 B 见 run-regression-timing.ps1，不在本脚本内。
#
# 用法（TargetDir 为已准备好源码的全新隔离目录；源码获取可由本脚本 -DoSourceFetch 完成）：
#   冷：powershell -File run-repro-timing.ps1 -Mode Cold -WorkRoot D:\iso-runs
#   温：powershell -File run-repro-timing.ps1 -Mode Warm -WorkRoot D:\iso-runs -ReuseCacheDir <cold-cache-dir> -TargetDir D:\iso-runs\Tidwatch-warm
#
# 退出码：0 全部核心阶段通过；1 有阶段失败；2 参数错误。

param(
    [ValidateSet('Cold', 'Warm')][string]$Mode = 'Cold',
    [Parameter(Mandatory = $true)][string]$WorkRoot,
    [string]$TargetDir = '',
    [string]$ReuseCacheDir = '',
    [string]$MirrorUrl = '',
    [switch]$Official,
    [switch]$DoSourceFetch,
    [string]$Repo = 'core567/Tidwatch',
    [string]$Branch = 'fusion/f2-overview-migration',
    [switch]$NoBrowser
)

. "$PSScriptRoot\common.ps1"

# ---------- 路径与证据目录 ----------
if (-not (Test-Path $WorkRoot)) { New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrEmpty($TargetDir)) { $TargetDir = Join-Path $WorkRoot ("Tidwatch-" + $Mode.ToLower() + "-" + $stamp) }
$evidenceDir = Join-Path $WorkRoot ("evidence-" + $Mode.ToLower() + "-" + $stamp)
$logDir = Join-Path $evidenceDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$cacheRoot = Join-Path $evidenceDir 'cache'
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

$phases = New-Object System.Collections.ArrayList
$overall = [System.Diagnostics.Stopwatch]::StartNew()

# ---------- 环境信息 ----------
function Get-EnvInfo {
    $os = Get-CimInstance Win32_OperatingSystem
    $info = [ordered]@{
        mode = $Mode
        collectedAt = (Get-Date).ToString('o')
        machine = $env:COMPUTERNAME
        osCaption = $os.Caption
        osVersion = $os.Version
        osBuild = $os.BuildNumber
        powershell = $PSVersionTable.PSVersion.ToString()
        python = (& py.exe -3.12 --version 2>$null)
        node = (& node.exe --version 2>$null)
        npm = (& npm.cmd --version 2>$null)
        git = (& git.exe --version 2>$null)
        workRoot = $WorkRoot
        targetDir = $TargetDir
        evidenceDir = $evidenceDir
        cacheRoot = $cacheRoot
        reuseCacheDir = $ReuseCacheDir
        officialSource = [bool]$Official
        mirrorUrl = $MirrorUrl
    }
    return $info
}
$envInfo = Get-EnvInfo
$envInfo | ConvertTo-Json -Depth 4 | Out-File -FilePath (Join-Path $evidenceDir 'env-info.json') -Encoding utf8

# ---------- 通用阶段执行器：计时 + 日志 + 退出码 ----------
function Invoke-Phase {
    param([string]$Name, [scriptblock]$Block, [string]$LogName)
    $logFile = Join-Path $logDir $LogName
    $rec = [ordered]@{
        name = $Name; startedAt = (Get-Date).ToString('o'); endedAt = $null
        elapsedSec = $null; exitCode = $null; ok = $false; detail = $null; logFile = $logFile
    }
    Write-Phase "PHASE/$Name" '开始'
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        # 边回显控制台边以 UTF-8 落盘（PS5.1 的 Tee-Object 默认写 UTF-16，故显式 Out-File）
        & $Block 2>&1 | ForEach-Object { Write-Host $_; $_ | Out-File -FilePath $logFile -Append -Encoding utf8 }
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
    } catch {
        $sw.Stop()
        $rec.endedAt = (Get-Date).ToString('o'); $rec.elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3)
        $rec.exitCode = 1; $rec.ok = $false; $rec.detail = "异常：$($_.Exception.Message)"
        "EXCEPTION: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
        [void]$phases.Add($rec)
        Write-Phase "PHASE/$Name" "异常：$($_.Exception.Message)"
        return 1
    }
    $sw.Stop()
    $rec.endedAt = (Get-Date).ToString('o'); $rec.elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3)
    $rec.exitCode = $code; $rec.ok = ($code -eq 0)
    if (-not $rec.ok) { $rec.detail = "退出码 $code" }
    [void]$phases.Add($rec)
    Write-Phase "PHASE/$Name" "结束 耗时=$($rec.elapsedSec)s 退出码=$code ok=$($rec.ok)"
    if ($code -ne 0) { return 1 }
    return 0
}

# 写最终结构化结果
function Write-TimingJson {
    param([bool]$Success, [string]$FailureReason = '')
    $overall.Stop()
    $result = [ordered]@{
        schema = 'tidewatch-repro-timing-v1'
        mode = $Mode
        success = $Success
        failureReason = $FailureReason
        startedAt = $envInfo.collectedAt
        finishedAt = (Get-Date).ToString('o')
        totalElapsedSec = [math]::Round($overall.Elapsed.TotalSeconds, 3)
        environment = $envInfo
        phases = $phases
    }
    $path = Join-Path $evidenceDir ("timing-$($Mode.ToLower()).json")
    $result | ConvertTo-Json -Depth 7 | Out-File -FilePath $path -Encoding utf8
    Write-Phase 'RESULT' "结构化计时已写入：$path"
    return $path
}

# 失败统一出口
function Fail-Run {
    param([string]$Reason)
    Write-Phase 'FAIL' $Reason
    # 尽量停掉本脚本启动的服务
    $stop = Join-Path $TargetDir 'scripts\repro\stop-services.ps1'
    if (Test-Path $stop) { & $stop *>&1 | Out-Null }
    Write-TimingJson -Success $false -FailureReason $Reason | Out-Null
    exit 1
}

$reproDir = Join-Path $TargetDir 'scripts\repro'

# ---------- 阶段 0（可选）：源码获取 ----------
if ($DoSourceFetch) {
    # 命名参数必须用【哈希表】splatting；数组 splat 会按位置绑定，导致 "-Mode" 等被当成实参值
    $fetchParams = @{ TargetDir = $TargetDir; Repo = $Repo; Branch = $Branch; Attempts = 3 }
    if ($MirrorUrl) { $fetchParams.MirrorUrl = $MirrorUrl }
    $rc = Invoke-Phase -Name 'source-fetch' -LogName '00-source-fetch.log' -Block {
        & (Join-Path $PSScriptRoot 'fetch-source.ps1') @fetchParams
    }
    if ($rc -ne 0) { Fail-Run '源码获取失败，见 00-source-fetch.log 与 fetch-report.json' }
} else {
    if (-not (Test-Path (Join-Path $TargetDir 'backend'))) { Fail-Run "TargetDir 无源码且未启用 -DoSourceFetch：$TargetDir" }
    # 显式记录“跳过”阶段（零耗时、标注原因），保证 timing JSON 阶段完整、口径透明
    [void]$phases.Add([ordered]@{
        name = 'source-fetch'; startedAt = (Get-Date).ToString('o'); endedAt = (Get-Date).ToString('o')
        elapsedSec = 0; exitCode = 0; ok = $true
        detail = '跳过网络获取：使用本地准备的隔离源码（非冷网络口径，取源耗时需另跑 -DoSourceFetch）'; logFile = $null
    })
    Write-Phase 'PHASE/source-fetch' '跳过（使用本地准备的隔离源码，非网络获取）'
}

if (-not (Test-Path $reproDir)) { Fail-Run "目标目录缺少 scripts/repro：$reproDir" }

# ---------- 阶段 1：依赖并行安装（冷/温缓存隔离）----------
# 哈希表 splatting 传命名参数（含 -Official 开关用 $true）
$installParams = @{ Mode = $Mode; CacheRoot = $cacheRoot }
if ($Official) { $installParams.Official = $true }
if ($Mode -eq 'Warm') {
    if ([string]::IsNullOrEmpty($ReuseCacheDir) -or -not (Test-Path $ReuseCacheDir)) { Fail-Run 'Warm 模式必须提供存在的 -ReuseCacheDir（冷启动缓存目录）' }
    $installParams.ReuseCacheDir = $ReuseCacheDir
}
$rc = Invoke-Phase -Name 'install-deps' -LogName '01-install-deps.log' -Block {
    & (Join-Path $reproDir 'install-deps.ps1') @installParams
}
if ($rc -ne 0) { Fail-Run '依赖安装失败，见 01-install-deps.log' }

# 定位本次实际使用的冷/温缓存目录并统计初始/结束文件数
$usedCache = if ($Mode -eq 'Warm') { $ReuseCacheDir } else { (Get-ChildItem $cacheRoot -Directory -Filter 'cold-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
$cacheInfo = [ordered]@{
    usedCacheDir = $usedCache
    pipCacheFiles = (Get-ChildItem (Join-Path $usedCache 'pip') -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    npmCacheFiles = (Get-ChildItem (Join-Path $usedCache 'npm') -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
}
$cacheInfo | ConvertTo-Json | Out-File -FilePath (Join-Path $evidenceDir 'cache-info.json') -Encoding utf8
Write-Phase 'CACHE' ("缓存目录={0} pip 文件数={1} npm 文件数={2}" -f $usedCache, $cacheInfo.pipCacheFiles, $cacheInfo.npmCacheFiles)

# ---------- 阶段 2：数据库初始化（全新库；温启动也重新初始化）----------
$dbPath = Join-Path $TargetDir 'data\tidewatch.db'
if (Test-Path $dbPath) { Remove-Item -Force $dbPath -ErrorAction SilentlyContinue; Write-Phase 'INITDB' '已移除既有 DB，保证全新数据库' }
$rc = Invoke-Phase -Name 'db-init' -LogName '02-db-init.log' -Block {
    & (Join-Path $reproDir 'init-db.ps1')
}
if ($rc -ne 0) { Fail-Run '数据库初始化失败，见 02-db-init.log' }

# ---------- 阶段 3：启动服务 + 健康检查 ----------
$rc = Invoke-Phase -Name 'start-health' -LogName '03-start-services.log' -Block {
    & (Join-Path $reproDir 'start-services.ps1')
}
if ($rc -ne 0) { Fail-Run '服务启动或健康检查失败，见 03-start-services.log' }

# ---------- 阶段 4：核心页面/路由访问验证 ----------
$pageResults = New-Object System.Collections.ArrayList
$routes = @('/', '/monitor', '/events', '/tasks', '/review')
$rc = Invoke-Phase -Name 'core-pages' -LogName '04-core-pages.log' -Block {
    foreach ($r in $routes) {
        $url = "http://localhost:5173$r"
        try {
            $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
            $ok = ($resp.StatusCode -eq 200 -and $resp.Content -match '<div id="root">')
            $line = "{0} -> HTTP {1} rootDiv={2}" -f $r, $resp.StatusCode, ($resp.Content -match '<div id="root">')
        } catch {
            $ok = $false; $line = "$r -> 异常 $($_.Exception.Message)"
        }
        Write-Host $line
        [void]$pageResults.Add([ordered]@{ route = $r; ok = $ok; detail = $line })
    }
    # 页面依赖的后端 API
    foreach ($api in @('/api/reaches', '/api/events', '/api/inspection-tasks', '/api/admin/diagnostics')) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000$api" -UseBasicParsing -TimeoutSec 10
            $ok = ($resp.StatusCode -eq 200)
            $line = "{0} -> HTTP {1} bytes={2}" -f $api, $resp.StatusCode, $resp.Content.Length
        } catch {
            $ok = $false; $line = "$api -> 异常 $($_.Exception.Message)"
        }
        Write-Host $line
        [void]$pageResults.Add([ordered]@{ route = $api; ok = $ok; detail = $line })
    }
    if (($pageResults | Where-Object { -not $_.ok }).Count -gt 0) { exit 1 }
}
$pageResults | ConvertTo-Json -Depth 4 | Out-File -FilePath (Join-Path $evidenceDir 'core-pages.json') -Encoding utf8
if ($rc -ne 0) { Fail-Run '核心页面/API 验证存在失败项，见 04-core-pages.log 与 core-pages.json' }

# ---------- 阶段 5：真实浏览器渲染校验（CDP，5 条路由差异化证据）----------
# 用已安装 Edge/Chrome 的 DevTools Protocol + 零依赖 Node 脚本，等待 React 渲染后再取 DOM/截图，
# 解决无头 one-shot 首帧抓取导致 5 条路由同图的问题。需要 Node>=22（内置 WebSocket）。
$renderScript = Join-Path $reproDir 'verify-render.mjs'
$browserPath = Resolve-Browser
$nodeVer = (& node.exe --version 2>$null)
$nodeMajor = 0; if ($nodeVer -match 'v(\d+)\.') { $nodeMajor = [int]$Matches[1] }
if ($NoBrowser) {
    [void]$phases.Add([ordered]@{ name='browser-render'; startedAt=(Get-Date).ToString('o'); endedAt=(Get-Date).ToString('o'); elapsedSec=0; exitCode=0; ok=$true; detail='-NoBrowser 跳过'; logFile=$null })
    Write-Phase 'BROWSER' '按 -NoBrowser 跳过浏览器渲染校验'
} elseif (-not $browserPath) {
    [void]$phases.Add([ordered]@{ name='browser-render'; startedAt=(Get-Date).ToString('o'); endedAt=(Get-Date).ToString('o'); elapsedSec=0; exitCode=0; ok=$true; detail='未找到 Edge/Chrome，跳过自动渲染校验，需人工浏览器检查 5 条路由并留存证据'; logFile=$null })
    Write-Phase 'BROWSER' '未找到浏览器，跳过自动渲染（请人工检查 /、/monitor、/events、/tasks、/review）'
} elseif ($nodeMajor -lt 22) {
    [void]$phases.Add([ordered]@{ name='browser-render'; startedAt=(Get-Date).ToString('o'); endedAt=(Get-Date).ToString('o'); elapsedSec=0; exitCode=0; ok=$true; detail="Node=$nodeVer 无内置 WebSocket（需>=22），跳过自动渲染，需人工浏览器检查"; logFile=$null })
    Write-Phase 'BROWSER' "Node $nodeVer 低于 22，跳过 CDP 自动渲染（请人工浏览器检查）"
} else {
    $renderOut = Join-Path $evidenceDir 'render'
    $rc = Invoke-Phase -Name 'browser-render' -LogName '05-browser-render.log' -Block {
        & node.exe $renderScript --base http://localhost:5173 --out $renderOut --port 9333
    }
    if ($rc -ne 0) { Fail-Run '浏览器真实渲染校验失败（存在路由未渲染或不可区分），见 05-browser-render.log 与 render/render-report.json' }
}

# ---------- 停止服务 ----------
$rc = Invoke-Phase -Name 'stop-services' -LogName '06-stop-services.log' -Block {
    & (Join-Path $reproDir 'stop-services.ps1')
}

$jsonPath = Write-TimingJson -Success $true
Write-Phase 'SUMMARY' "模式=$Mode 核心复现总耗时=$([math]::Round($overall.Elapsed.TotalSeconds,3))s"
Write-Phase 'SUMMARY' "证据目录：$evidenceDir"
exit 0
