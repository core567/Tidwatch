# TideWatch 扩展回归测试计时（B：完整回归，独立于核心复现 A）—— PowerShell 5.1+
#
# 在一个已完成依赖安装（backend\.venv、frontend\node_modules 就绪）的隔离目录上运行，
# 逐阶段 Stopwatch 计时并记录退出码与原始日志，输出 timing-regression.json。
# B 的耗时单独统计，绝不并入 A 核心复现时间；任一阶段失败如实记录并最终返回非 0，不谎报通过。
#
# 用法：
#   powershell -File run-regression-timing.ps1 -TargetDir D:\iso-runs\Tidwatch-cold-xxxx -EvidenceDir D:\iso-runs\evidence-reg
#
# 退出码：0 全部回归阶段通过；1 有失败；2 参数错误。

param(
    [Parameter(Mandatory = $true)][string]$TargetDir,
    [string]$EvidenceDir = '',
    [switch]$IncludeFailureMatrix
)

. "$PSScriptRoot\common.ps1"

if (-not (Test-Path (Join-Path $TargetDir 'backend'))) { Write-Phase 'ERROR' "TargetDir 无源码：$TargetDir"; exit 2 }
if ([string]::IsNullOrEmpty($EvidenceDir)) { $EvidenceDir = Join-Path (Split-Path -Parent $TargetDir) ("evidence-reg-" + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$logDir = Join-Path $EvidenceDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$venvPython = Join-Path $TargetDir 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) { Write-Phase 'ERROR' "缺少 $venvPython，请先完成核心复现的依赖安装"; exit 2 }

$phases = New-Object System.Collections.ArrayList
$overall = [System.Diagnostics.Stopwatch]::StartNew()

# 环境信息
$os = Get-CimInstance Win32_OperatingSystem
$envInfo = [ordered]@{
    schema = 'tidewatch-regression-env'
    collectedAt = (Get-Date).ToString('o'); machine = $env:COMPUTERNAME
    osCaption = $os.Caption; osVersion = $os.Version; powershell = $PSVersionTable.PSVersion.ToString()
    python = (& $venvPython --version 2>$null); node = (& node.exe --version 2>$null); npm = (& npm.cmd --version 2>$null)
    targetDir = $TargetDir; evidenceDir = $EvidenceDir; includeFailureMatrix = [bool]$IncludeFailureMatrix
}
$envInfo | ConvertTo-Json -Depth 4 | Out-File -FilePath (Join-Path $EvidenceDir 'env-info.json') -Encoding utf8

function Invoke-Phase {
    param([string]$Name, [string]$WorkDir, [scriptblock]$Block, [string]$LogName)
    $logFile = Join-Path $logDir $LogName
    $rec = [ordered]@{ name = $Name; startedAt = (Get-Date).ToString('o'); endedAt = $null; elapsedSec = $null; exitCode = $null; ok = $false; detail = $null; logFile = $logFile }
    Write-Phase "REG/$Name" '开始'
    Push-Location $WorkDir
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        & $Block 2>&1 | ForEach-Object { Write-Host $_; $_ | Out-File -FilePath $logFile -Append -Encoding utf8 }
        $code = $LASTEXITCODE; if ($null -eq $code) { $code = 0 }
    } catch {
        $sw.Stop(); Pop-Location
        $rec.endedAt = (Get-Date).ToString('o'); $rec.elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3)
        $rec.exitCode = 1; $rec.detail = "异常：$($_.Exception.Message)"
        "EXCEPTION: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
        [void]$phases.Add($rec); Write-Phase "REG/$Name" "异常：$($_.Exception.Message)"; return 1
    }
    $sw.Stop(); Pop-Location
    $rec.endedAt = (Get-Date).ToString('o'); $rec.elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 3)
    $rec.exitCode = $code; $rec.ok = ($code -eq 0); if (-not $rec.ok) { $rec.detail = "退出码 $code" }
    [void]$phases.Add($rec)
    Write-Phase "REG/$Name" "结束 耗时=$($rec.elapsedSec)s 退出码=$code ok=$($rec.ok)"
    if ($code -ne 0) { return 1 }
    return 0
}

$backendDir = Join-Path $TargetDir 'backend'
$frontendDir = Join-Path $TargetDir 'frontend'
$miniprogramDir = Join-Path $TargetDir 'miniprogram'
$failed = @()

# 1) 后端 pytest（默认排除需外部 Broker 的故障矩阵）
$pytestArgs = @('-m', 'pytest', 'tests')
if (-not $IncludeFailureMatrix) { $pytestArgs += @('--ignore=tests/test_failure_matrix.py') }
$rc = Invoke-Phase -Name 'backend-pytest' -WorkDir $backendDir -LogName 'r1-backend-pytest.log' -Block {
    & $venvPython @pytestArgs
}
if ($rc -ne 0) { $failed += 'backend-pytest' }

# 2) 前端 typecheck
$rc = Invoke-Phase -Name 'frontend-typecheck' -WorkDir $frontendDir -LogName 'r2-typecheck.log' -Block { & npm.cmd run typecheck }
if ($rc -ne 0) { $failed += 'frontend-typecheck' }

# 3) 前端 build
$rc = Invoke-Phase -Name 'frontend-build' -WorkDir $frontendDir -LogName 'r3-build.log' -Block { & npm.cmd run build }
if ($rc -ne 0) { $failed += 'frontend-build' }

# 4) 3D 单测
$rc = Invoke-Phase -Name 'frontend-test-3d' -WorkDir $frontendDir -LogName 'r4-test-3d.log' -Block { & npm.cmd run test:3d }
if ($rc -ne 0) { $failed += 'frontend-test-3d' }

# 5) 告警单测
$rc = Invoke-Phase -Name 'frontend-test-alerts' -WorkDir $frontendDir -LogName 'r5-test-alerts.log' -Block { & npm.cmd run test:alerts }
if ($rc -ne 0) { $failed += 'frontend-test-alerts' }

# 6) 小程序：先 npm ci（轻量，2 个 dev 包）再 npm test
$rc = Invoke-Phase -Name 'miniprogram-test' -WorkDir $miniprogramDir -LogName 'r6-miniprogram.log' -Block {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { exit 1 }
    & npm.cmd test
}
if ($rc -ne 0) { $failed += 'miniprogram-test' }

$overall.Stop()
$success = ($failed.Count -eq 0)
$result = [ordered]@{
    schema = 'tidewatch-regression-timing-v1'
    success = $success
    failedPhases = $failed
    startedAt = $envInfo.collectedAt
    finishedAt = (Get-Date).ToString('o')
    totalElapsedSec = [math]::Round($overall.Elapsed.TotalSeconds, 3)
    environment = $envInfo
    phases = $phases
}
$path = Join-Path $EvidenceDir 'timing-regression.json'
$result | ConvertTo-Json -Depth 7 | Out-File -FilePath $path -Encoding utf8

Write-Phase 'SUMMARY' "回归 B 总耗时=$([math]::Round($overall.Elapsed.TotalSeconds,3))s 成功=$success 失败项=$($failed -join ',')"
Write-Phase 'SUMMARY' "结构化结果：$path"
if ($success) { exit 0 } else { exit 1 }
