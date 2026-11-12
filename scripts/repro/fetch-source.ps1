# TideWatch 源码获取（PowerShell 5.1+）
# 通道顺序（不内置任何固定第三方镜像）：
#   1) 官方 codeload tar.gz（默认优先，带重试）
#   2) 镜像 codeload —— 仅当显式传入 -MirrorUrl 才启用；不可用自动跳过，不作为硬依赖
#   3) 官方 git 浅克隆 --depth 1 --single-branch（最终兜底）
# 每次尝试都记录：来源、URL、HTTP 码、字节数、耗时、成败与错误；下载后做 gzip 完整性与
# 关键文件完整性检查，并把结构化报告写入 -ReportPath（默认 <TargetDir 同级>/fetch-report.json）。
# 不依赖任何全局 git 代理或 VSClaude 专属配置。
#
# 用法：
#   官方优先（不使用任何镜像）：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/fetch-source.ps1 -TargetDir D:\iso\Tidwatch
#   显式提供备用镜像（结尾不要带斜杠；不可用会自动跳过）：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/fetch-source.ps1 -TargetDir D:\iso\Tidwatch `
#       -MirrorUrl https://your-mirror.example.com
#
# 退出码：0 成功且完整性通过；1 全部获取方式失败或完整性不符；2 参数/环境错误。

param(
    [string]$Repo = 'core567/Tidwatch',
    [string]$Branch = 'fusion/f2-overview-migration',
    [Parameter(Mandatory = $true)][string]$TargetDir,
    [string]$MirrorUrl = '',
    [int]$Attempts = 3,
    [string]$ReportPath = ''
)

. "$PSScriptRoot\common.ps1"

$workRoot = Split-Path -Parent $TargetDir
if (-not (Test-Path $workRoot)) { New-Item -ItemType Directory -Force -Path $workRoot | Out-Null }
if (Test-Path (Join-Path $TargetDir 'backend')) {
    Write-Phase 'ERROR' "目标目录已存在且含 backend/：$TargetDir。全新复现请指定空目录。"
    exit 2
}
if ([string]::IsNullOrEmpty($ReportPath)) { $ReportPath = Join-Path $workRoot 'fetch-report.json' }

$codeloadUrl = "https://codeload.github.com/$Repo/tar.gz/refs/heads/$Branch"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $workRoot "tidewatch-$stamp.tar.gz"

$report = [ordered]@{
    repo            = $Repo
    branch          = $Branch
    targetDir       = $TargetDir
    startedAt       = (Get-Date).ToString('o')
    finishedAt      = $null
    totalElapsedSec = $null
    chosenMethod    = $null
    success         = $false
    archiveBytes    = $null
    gzipIntegrity   = $null
    contentIntegrity = $null
    commitSha       = $null
    reportPath      = $ReportPath
    attempts        = New-Object System.Collections.ArrayList
}

function Save-Report {
    $report.finishedAt = (Get-Date).ToString('o')
    $report | ConvertTo-Json -Depth 6 | Out-File -FilePath $ReportPath -Encoding utf8
}

# 尽力记录分支对应 commit（codeload 包本身不含 .git；API 不通不致命）
function Try-RecordCommitSha {
    try {
        $api = "https://api.github.com/repos/$Repo/commits/$Branch"
        $sha = (Invoke-RestMethod -Uri $api -TimeoutSec 15 -Headers @{ 'User-Agent' = 'tidewatch-repro' }).sha
        if ($sha) { $report.commitSha = $sha; Write-Phase 'SOURCE' "分支 $Branch 当前 commit=$sha" }
    } catch {
        Write-Phase 'SOURCE' "无法从 API 获取 commit SHA（不影响下载）：$($_.Exception.Message)"
    }
}

# 单次下载，返回结构化结果（curl 优先，缺失时回退 Invoke-WebRequest）
function Invoke-Download {
    param([string]$Url, [string]$Out, [string]$Method)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $rec = [ordered]@{ method = $Method; url = $Url; httpCode = $null; bytes = $null; elapsedSec = $null; ok = $false; error = $null }
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        # --speed-limit/--speed-time：平均速度低于 1KB/s 持续 30s 即中止（exit 28），避免停滞连接无限挂起
        # --max-time 900：单次下载总上限 15 分钟，兜底防止永久阻塞
        $metrics = & curl.exe -L --fail --retry 1 --retry-delay 2 --connect-timeout 20 `
            --speed-limit 1024 --speed-time 30 --max-time 900 `
            -sS -o $Out -w '%{http_code}|%{size_download}|%{time_total}' $Url 2>$null
        $rc = $LASTEXITCODE
        $sw.Stop()
        $parts = "$metrics" -split '\|'
        if ($parts.Count -ge 3) { $rec.httpCode = $parts[0]; $rec.bytes = [int64]$parts[1] }
        $rec.elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3)
        if ($rc -eq 0 -and (Test-Path $Out) -and $rec.bytes -gt 0) { $rec.ok = $true }
        else { $rec.error = "curl exit=$rc metrics=$metrics" }
    } else {
        try {
            Invoke-WebRequest -Uri $Url -OutFile $Out -UseBasicParsing -TimeoutSec 600
            $sw.Stop()
            $rec.ok = $true; $rec.httpCode = '200'
            $rec.bytes = (Get-Item $Out).Length; $rec.elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3)
        } catch {
            $sw.Stop(); $rec.elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3); $rec.error = $_.Exception.Message
        }
    }
    return $rec
}

# gzip 完整性：tar 能否列出内容
function Test-Gzip {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    & tar.exe -tzf $Path *> $null
    return ($LASTEXITCODE -eq 0)
}

$totalSw = [System.Diagnostics.Stopwatch]::StartNew()
$ok = $false

# ---- 方法 1：官方 codeload ----
for ($i = 1; $i -le $Attempts -and -not $ok; $i++) {
    Write-Phase 'SOURCE' "官方 codeload 尝试 $i/$Attempts：$codeloadUrl"
    if (Test-Path $archive) { Remove-Item -Force $archive }
    $r = Invoke-Download -Url $codeloadUrl -Out $archive -Method "codeload-official#$i"
    [void]$report.attempts.Add($r)
    if ($r.ok) { $ok = $true; $report.chosenMethod = 'codeload-official' }
    else { Write-Phase 'SOURCE' "官方 codeload 失败：$($r.error)" }
}

# ---- 方法 2：镜像（仅在显式配置时启用，不可用自动跳过）----
if (-not $ok) {
    if ([string]::IsNullOrEmpty($MirrorUrl)) {
        Write-Phase 'SOURCE' '未配置 -MirrorUrl，跳过镜像通道'
    } else {
        $mirrorUrl = "$MirrorUrl/$codeloadUrl"
        Write-Phase 'SOURCE' "尝试备用镜像（失败将自动跳过）：$mirrorUrl"
        if (Test-Path $archive) { Remove-Item -Force $archive }
        $r = Invoke-Download -Url $mirrorUrl -Out $archive -Method 'codeload-mirror'
        [void]$report.attempts.Add($r)
        if ($r.ok) { $ok = $true; $report.chosenMethod = 'codeload-mirror' }
        else { Write-Phase 'SOURCE' "镜像不可用，自动跳过：$($r.error)" }
    }
}

# ---- 方法 3：官方 git 浅克隆（兜底，含完整 .git）----
if (-not $ok) {
    Write-Phase 'SOURCE' 'codeload 通道均失败，尝试官方 git 浅克隆 --depth 1 --single-branch'
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & git.exe clone --depth 1 --single-branch --branch $Branch "https://github.com/$Repo.git" $TargetDir
    $rc = $LASTEXITCODE
    $sw.Stop()
    $gr = [ordered]@{ method = 'git-shallow'; url = "https://github.com/$Repo.git"; httpCode = $null; bytes = $null; elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3); ok = ($rc -eq 0); error = $(if ($rc -ne 0) { "git exit=$rc" } else { $null }) }
    [void]$report.attempts.Add($gr)
    if ($rc -eq 0 -and (Test-Path (Join-Path $TargetDir '.git'))) {
        $ok = $true; $report.chosenMethod = 'git-shallow'; $report.success = $true
        $report.contentIntegrity = 'git-clone (has .git)'
        $totalSw.Stop(); $report.totalElapsedSec = [math]::Round($totalSw.Elapsed.TotalSeconds, 3)
        Try-RecordCommitSha; Save-Report
        Write-Phase 'TIMING' "源码获取完成（git-shallow），总耗时 $($report.totalElapsedSec) 秒；报告 $ReportPath"
        exit 0
    }
}

if (-not $ok) {
    $totalSw.Stop(); $report.totalElapsedSec = [math]::Round($totalSw.Elapsed.TotalSeconds, 3)
    Save-Report
    Write-Phase 'RESULT' "三种获取方式全部失败，总耗时 $($report.totalElapsedSec) 秒。详见 $ReportPath"
    exit 1
}

# ---- 下载包完整性与解压 ----
$report.archiveBytes = (Get-Item $archive).Length
$gzipOk = Test-Gzip -Path $archive
$report.gzipIntegrity = if ($gzipOk) { 'tar -tzf list OK' } else { 'FAILED' }
if (-not $gzipOk) {
    $totalSw.Stop(); $report.totalElapsedSec = [math]::Round($totalSw.Elapsed.TotalSeconds, 3); Save-Report
    Write-Phase 'ERROR' 'gzip 完整性检查失败，包可能下载不完整'
    exit 1
}

$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) { Save-Report; Write-Phase 'ERROR' '未找到 tar.exe，无法解压'; exit 2 }
$extractTmp = Join-Path $workRoot "extract-$stamp"
New-Item -ItemType Directory -Force -Path $extractTmp | Out-Null
& tar.exe -xzf $archive -C $extractTmp
if ($LASTEXITCODE -ne 0) { Save-Report; Write-Phase 'ERROR' 'tar 解压失败'; exit 1 }
$inner = Get-ChildItem -Directory $extractTmp | Select-Object -First 1
if (-not $inner) { Save-Report; Write-Phase 'ERROR' '压缩包内未找到顶层目录'; exit 1 }
Move-Item $inner.FullName $TargetDir
Remove-Item -Recurse -Force $extractTmp
Remove-Item -Force $archive

# ---- 内容完整性：关键文件必须存在 ----
$mustHave = @('backend/requirements-lock.txt', 'frontend/package-lock.json', 'frontend/package.json', 'README.md')
$missing = @()
foreach ($f in $mustHave) { if (-not (Test-Path (Join-Path $TargetDir $f))) { $missing += $f } }
$totalSw.Stop()
$report.totalElapsedSec = [math]::Round($totalSw.Elapsed.TotalSeconds, 3)
if ($missing.Count -gt 0) {
    $report.contentIntegrity = "MISSING: $($missing -join ', ')"
    Save-Report; Write-Phase 'RESULT' "内容不完整，缺失：$($missing -join ', ')"
    exit 1
}
$report.contentIntegrity = 'all required files present'
$report.success = $true
Try-RecordCommitSha
Save-Report
Write-Phase 'TIMING' "源码获取完成（$($report.chosenMethod)），$($report.archiveBytes) 字节，总耗时 $($report.totalElapsedSec) 秒"
Write-Phase 'RESULT' "源码已就绪：$TargetDir；结构化报告：$ReportPath"
exit 0
