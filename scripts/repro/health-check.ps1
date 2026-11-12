# TideWatch 复现健康检查（PowerShell 5.1+）
# 用途：在后端、前端启动后，用带超时的轮询验证服务真实就绪，而非固定 sleep 等待。
# 检查三项：
#   1) 后端 http://127.0.0.1:8000/api/health 返回 200 且 status=ok、database=ok
#   2) 前端 http://localhost:5173 返回 200 且为 Vite 入口 HTML（含 <div id="root">）
#   3) 前端经 Vite 代理访问后端 http://localhost:5173/api/health 返回 200（端到端链路）
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/repro/health-check.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/repro/health-check.ps1 -BackendPort 8000 -FrontendPort 5173 -TimeoutSeconds 90
# 退出码：0 全部通过；1 任一项超时或字段不符合预期。

param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [int]$TimeoutSeconds = 90
)

. "$PSScriptRoot/common.ps1"

$backendUrl = "http://127.0.0.1:$BackendPort/api/health"
$frontendUrl = "http://localhost:$FrontendPort/"
$proxyUrl = "http://localhost:$FrontendPort/api/health"
$fail = 0

# 1) 后端健康检查（先等端口就绪，再校验 JSON 字段）
$rc = Wait-HttpUrl -Url $backendUrl -TimeoutSeconds $TimeoutSeconds -ExpectJsonSubstring '"status":"ok"' -Phase 'BACKEND'
if ($rc -ne 0) { $fail = 1 } else {
    try {
        $health = (Invoke-WebRequest -Uri $backendUrl -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
        Write-Phase 'BACKEND' "health 响应：$($health | ConvertTo-Json -Compress)"
        if ($health.status -ne 'ok' -or $health.database -ne 'ok') {
            Write-Phase 'BACKEND' "字段不符合预期（status=$($health.status), database=$($health.database)）"
            $fail = 1
        } else {
            Write-Phase 'BACKEND' "status=ok 且 database=ok，版本=$($health.version)"
        }
    } catch {
        Write-Phase 'BACKEND' "JSON 解析失败：$($_.Exception.Message)"
        $fail = 1
    }
}

# 2) 前端入口可达性
$rc = Wait-HttpUrl -Url $frontendUrl -TimeoutSeconds $TimeoutSeconds -Phase 'FRONTEND'
if ($rc -ne 0) { $fail = 1 } else {
    try {
        $html = (Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 5).Content
        if ($html -match '<div id="root">') {
            Write-Phase 'FRONTEND' "Vite 入口 HTML 正常（含 <div id=`"root`">）"
        } else {
            Write-Phase 'FRONTEND' "入口 HTML 未包含 <div id=`"root`">，疑似非预期页面"
            $fail = 1
        }
    } catch {
        Write-Phase 'FRONTEND' "读取入口 HTML 失败：$($_.Exception.Message)"
        $fail = 1
    }
}

# 3) 前端 -> 后端 Vite 代理链路（验证 /api 代理配置真实生效）
$rc = Wait-HttpUrl -Url $proxyUrl -TimeoutSeconds 30 -ExpectJsonSubstring '"status":"ok"' -Phase 'PROXY'
if ($rc -ne 0) { $fail = 1 } else {
    Write-Phase 'PROXY' "经 Vite 代理访问 /api/health 成功，前后端链路打通"
}

if ($fail -eq 0) {
    Write-Phase 'RESULT' '健康检查全部通过'
    exit 0
} else {
    Write-Phase 'RESULT' '健康检查存在失败项，请查看上方日志'
    exit 1
}
