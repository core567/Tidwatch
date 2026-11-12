# TideWatch 复现服务停止（PowerShell 5.1+）
# 读取 start-services.ps1 写入的 PID，优雅停止前后端进程及其子进程。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/repro/stop-services.ps1

. "$PSScriptRoot\common.ps1"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runDir = Join-Path $repoRoot '.repro-cache\run'

function Stop-PidFile {
    param([string]$PidFile, [string]$Label)
    if (-not (Test-Path $PidFile)) { Write-Phase 'STOP' "$Label 无 PID 文件，跳过"; return }
    $procId = [int]((Get-Content $PidFile -First 1).Trim())
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
        # 先停子进程（uvicorn reload 子进程等），再停父进程
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$procId" -ErrorAction SilentlyContinue |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Phase 'STOP' "$Label 已停止 PID=$procId"
    } else {
        Write-Phase 'STOP' "$Label PID=$procId 进程已不存在"
    }
    Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
}

Stop-PidFile -PidFile (Join-Path $runDir 'backend.pid') -Label '后端 uvicorn'
Stop-PidFile -PidFile (Join-Path $runDir 'frontend.pid') -Label '前端 vite'

# 兜底：清理可能占用端口的残留 node/python（仅当 PID 文件缺失时提示，避免误杀开发进程）
foreach ($port in @(8000, 5173)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        Write-Phase 'WARN' "端口 $port 仍在监听，占用进程：$((($conns | Select-Object -Expand OwningProcess -Unique) -join ','))。如确认是残留复现进程，请手动 Stop-Process。"
    }
}
Write-Phase 'RESULT' '停止流程完成'
