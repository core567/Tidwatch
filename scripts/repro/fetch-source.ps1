# TideWatch 源码获取（PowerShell 5.1+）
# 背景：实测本机到 GitHub 的 smart-http（git clone）可能被重置，而 codeload 的 HTTPS/CDN 通道可通但较慢。
# 因此按“官方 codeload -> 镜像前缀 codeload -> 官方 git 浅克隆”的顺序尝试，任一成功即返回，全部失败才报错。
# 不依赖任何全局 git 代理或 VSClaude 专属配置。
#
# 用法：
#   默认（官方 codeload 优先，失败再试镜像与浅克隆）：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/fetch-source.ps1 -TargetDir D:\iso\Tidwatch
#   只用官方源（禁用第三方镜像）：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/fetch-source.ps1 -TargetDir D:\iso\Tidwatch -NoMirror
#   自定义镜像前缀（结尾不要带斜杠；会在前面拼接完整 codeload URL）：
#     powershell -ExecutionPolicy Bypass -File scripts/repro/fetch-source.ps1 -TargetDir D:\iso\Tidwatch -MirrorUrl https://gh-proxy.com
#
# 退出码：0 成功（目标目录含 backend/requirements-lock.txt）；1 全部获取方式失败；2 参数/环境错误。

param(
    [string]$Repo = 'core567/Tidwatch',
    [string]$Branch = 'fusion/f2-overview-migration',
    [Parameter(Mandatory = $true)][string]$TargetDir,
    [string]$MirrorUrl = 'https://gh-proxy.com',
    [switch]$NoMirror,
    [int]$Attempts = 3
)

. "$PSScriptRoot\common.ps1"

$workRoot = Split-Path -Parent $TargetDir
if (-not (Test-Path $workRoot)) { New-Item -ItemType Directory -Force -Path $workRoot | Out-Null }
if (Test-Path (Join-Path $TargetDir 'backend')) {
    Write-Phase 'ERROR' "目标目录已存在且含 backend/：$TargetDir。全新复现请指定空目录。"
    exit 2
}

$codeloadUrl = "https://codeload.github.com/$Repo/tar.gz/refs/heads/$Branch"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $workRoot "tidewatch-$stamp.tar.gz"

# 尽力记录分支对应的 commit SHA（API 不通不致命；codeload 包本身不含 .git）
function Try-RecordCommitSha {
    try {
        $api = "https://api.github.com/repos/$Repo/commits/$Branch"
        $sha = (Invoke-RestMethod -Uri $api -TimeoutSec 15 -Headers @{ 'User-Agent' = 'tidewatch-repro' }).sha
        if ($sha) { Write-Phase 'SOURCE' "分支 $Branch 当前 commit=$sha" }
    } catch {
        Write-Phase 'SOURCE' "无法从 API 获取 commit SHA（不影响下载）：$($_.Exception.Message)"
    }
}

# 用 curl.exe 下载（带重试与断点续传）；不可用时回退 Invoke-WebRequest
function Download-File {
    param([string]$Url, [string]$Out)
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & curl.exe -L --fail --retry 2 --retry-delay 3 -C - --connect-timeout 20 -o $Out $Url
        return $LASTEXITCODE
    }
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Out -UseBasicParsing -TimeoutSec 600
        return 0
    } catch {
        return 1
    }
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ok = $false
$methodUsed = ''

# ---- 方法 1：官方 codeload ----
Write-Phase 'SOURCE' "尝试官方 codeload：$codeloadUrl"
$rc = Invoke-WithRetry -Name 'codeload-official' -Attempts $Attempts -Block { Download-File -Url $codeloadUrl -Out $archive }
if ($rc -eq 0 -and (Test-Path $archive)) { $ok = $true; $methodUsed = 'codeload-official' }

# ---- 方法 2：镜像前缀 codeload ----
if (-not $ok -and -not $NoMirror -and $MirrorUrl) {
    $mirrorUrl = "$MirrorUrl/$codeloadUrl"
    Write-Phase 'SOURCE' "官方通道失败，尝试镜像：$mirrorUrl"
    if (Test-Path $archive) { Remove-Item -Force $archive }
    $rc = Invoke-WithRetry -Name 'codeload-mirror' -Attempts 2 -Block { Download-File -Url $mirrorUrl -Out $archive }
    if ($rc -eq 0 -and (Test-Path $archive)) { $ok = $true; $methodUsed = 'codeload-mirror' }
}

# ---- 方法 3：官方 git 浅克隆（含完整 .git，可记录 commit）----
if (-not $ok) {
    Write-Phase 'SOURCE' 'codeload 均失败，尝试官方 git 浅克隆 --depth 1 --single-branch'
    $rc = Invoke-WithRetry -Name 'git-shallow' -Attempts 2 -Block {
        & git.exe clone --depth 1 --single-branch --branch $Branch "https://github.com/$Repo.git" $TargetDir
    }
    if ($rc -eq 0 -and (Test-Path (Join-Path $TargetDir '.git'))) {
        $ok = $true; $methodUsed = 'git-shallow'
        $sw.Stop()
        Write-Phase 'TIMING' "源码获取完成（$methodUsed），耗时 $(Get-ElapsedSeconds $sw) 秒"
        Try-RecordCommitSha
        exit 0
    }
}

if (-not $ok) {
    $sw.Stop()
    Write-Phase 'RESULT' "三种获取方式全部失败，耗时 $(Get-ElapsedSeconds $sw) 秒。请检查网络/代理后重试，或手动下载并解压到 $TargetDir。"
    exit 1
}

# ---- 解压 codeload tar.gz（Windows 10/11 自带 bsdtar 的 tar.exe）----
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) {
    Write-Phase 'ERROR' '未找到 tar.exe，无法解压 codeload 包；请安装 bsdtar 或改用 git 浅克隆方式。'
    exit 2
}
$extractTmp = Join-Path $workRoot "extract-$stamp"
New-Item -ItemType Directory -Force -Path $extractTmp | Out-Null
Write-Phase 'SOURCE' "解压到 $extractTmp"
& tar.exe -xzf $archive -C $extractTmp
if ($LASTEXITCODE -ne 0) { Write-Phase 'ERROR' 'tar 解压失败，包可能下载不完整'; exit 1 }

$inner = Get-ChildItem -Directory $extractTmp | Select-Object -First 1
if (-not $inner) { Write-Phase 'ERROR' '压缩包内未找到顶层目录'; exit 1 }
Move-Item $inner.FullName $TargetDir
Remove-Item -Recurse -Force $extractTmp
Remove-Item -Force $archive

# ---- 完整性校验：关键文件必须存在 ----
$mustHave = @('backend/requirements-lock.txt', 'frontend/package-lock.json', 'frontend/package.json', 'README.md')
$missing = @()
foreach ($f in $mustHave) { if (-not (Test-Path (Join-Path $TargetDir $f))) { $missing += $f } }
$sw.Stop()
if ($missing.Count -gt 0) {
    Write-Phase 'RESULT' "获取内容不完整，缺失：$($missing -join ', ')"
    exit 1
}
Write-Phase 'TIMING' "源码获取完成（$methodUsed），耗时 $(Get-ElapsedSeconds $sw) 秒"
Write-Phase 'RESULT' "源码已就绪：$TargetDir"
Try-RecordCommitSha
exit 0
