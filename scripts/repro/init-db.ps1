# TideWatch 数据库初始化（PowerShell 5.1+）
# 保留两个必要且职责不同的步骤，不合并、不跳过：
#   1) init_db.py：metadata.create_all 建表（幂等）
#   2) seed_data.py：写入断面/用户/指标字典/规则等种子（幂等，已存在则跳过）
# 若 backend\.env 不存在，则从 .env.example 复制一份，保证复现者无需手工准备配置。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/repro/init-db.ps1
# 退出码：0 成功；非 0 失败。

. "$PSScriptRoot\common.ps1"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendDir = Join-Path $repoRoot 'backend'
$venvPython = Join-Path $backendDir '.venv\Scripts\python.exe'
$envExample = Join-Path $backendDir '.env.example'
$envFile = Join-Path $backendDir '.env'

if (-not (Test-Path $venvPython)) {
    Write-Phase 'ERROR' "未找到 $venvPython，请先运行 install-deps.ps1"
    exit 1
}

# 复现环境配置：缺省自动复制 .env.example（默认 MQTT_ENABLED=false，适配无 Broker 复现）
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Phase 'CONFIG' "已从 .env.example 生成 .env（默认 MQTT_ENABLED=false）"
    } else {
        Write-Phase 'WARN' '.env.example 不存在，将使用应用内置默认配置'
    }
} else {
    Write-Phase 'CONFIG' '.env 已存在，保留不覆盖'
}

Set-Location $backendDir
$total = [System.Diagnostics.Stopwatch]::StartNew()

Write-Phase 'INITDB' '运行 scripts/init_db.py 建表...'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $venvPython scripts/init_db.py
$rc1 = $LASTEXITCODE
$sw.Stop()
Write-Phase 'INITDB' "init_db.py 退出码=$rc1，耗时 $(Get-ElapsedSeconds $sw) 秒"
if ($rc1 -ne 0) { $total.Stop(); exit $rc1 }

Write-Phase 'SEED' '运行 scripts/seed_data.py 写入种子数据...'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $venvPython scripts/seed_data.py
$rc2 = $LASTEXITCODE
$sw.Stop()
Write-Phase 'SEED' "seed_data.py 退出码=$rc2，耗时 $(Get-ElapsedSeconds $sw) 秒"
$total.Stop()

if ($rc2 -eq 0) {
    Write-Phase 'TIMING' "数据库初始化总耗时（init+seed）：$(Get-ElapsedSeconds $total) 秒"
    Write-Phase 'RESULT' '数据库初始化完成'
    exit 0
} else {
    Write-Phase 'RESULT' '种子数据写入失败'
    exit $rc2
}
