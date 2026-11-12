# TideWatch 复现工具公共函数（Windows PowerShell 5.1+ 兼容，不依赖 pwsh 7 专属语法）
# 被同目录其他脚本通过 `. "$PSScriptRoot/common.ps1"` 引用。
# 设计原则：不读取、不依赖任何全局 pip/npm 配置或 VSClaude 专属环境变量；
#           镜像与官方源均由参数显式传入；所有动作打印带时间戳的阶段日志。

# 关闭 Invoke-WebRequest 进度条，避免 PS 5.1 下显著拖慢下载
$ProgressPreference = 'SilentlyContinue'

# 统一控制台输出为 UTF-8，避免在不同宿主（PowerShell 窗口 / Git Bash 捕获 / CI）下中文乱码
try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $utf8NoBom
    $OutputEncoding = $utf8NoBom
    # 让 Out-File/Add-Content 默认写 UTF-8（PS 5.1 默认是 UTF-16）
    $PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
    $PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'
    $PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
} catch { }

# 统一阶段日志：Write-Phase "PHASE" "message"
function Write-Phase {
    param([string]$Phase, [string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
    Write-Host "[$ts] [$Phase] $Message"
}

# 高精度计步器：返回秒（3 位小数）
function Get-ElapsedSeconds {
    param([System.Diagnostics.Stopwatch]$Sw)
    return [math]::Round($Sw.Elapsed.TotalSeconds, 3)
}

# 带重试的命令执行：Invoke-WithRetry -Name <标签> -Attempts <n> -ScriptBlock {...}
# 任一尝试返回 0 即成功；全部失败返回最后一次退出码，不抛异常，由调用方判定。
function Invoke-WithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Block,
        [int]$Attempts = 2,
        [int]$DelaySeconds = 3
    )
    $last = 0
    for ($i = 1; $i -le $Attempts; $i++) {
        Write-Phase $Name "尝试 $i/$Attempts"
        & $Block
        $last = $LASTEXITCODE
        if ($null -eq $last) { $last = 0 }  # 原生 cmdlet 成功时无 $LASTEXITCODE
        if ($last -eq 0) {
            Write-Phase $Name "尝试 $i 成功"
            return 0
        }
        Write-Phase $Name "尝试 $i 失败（exit=$last）"
        if ($i -lt $Attempts) { Start-Sleep -Seconds $DelaySeconds }
    }
    Write-Phase $Name "全部 $Attempts 次尝试失败（last exit=$last）"
    return $last
}

# HTTP 轮询等待：Wait-HttpUrl -Url http://127.0.0.1:8000/api/health -TimeoutSeconds 60
# 每 IntervalSeconds 探一次，HTTP 200 即成功；超时返回 1。
# -ExpectJsonSubstring 可选：要求响应体包含指定子串（用于校验 status/database 字段）。
function Wait-HttpUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 60,
        [int]$IntervalSeconds = 2,
        [string]$ExpectJsonSubstring = '',
        [string]$Phase = 'HEALTH'
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attempt = 0
    while ((Get-Date) -lt $deadline) {
        $attempt++
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) {
                if ($ExpectJsonSubstring -ne '' -and $resp.Content -notmatch [regex]::Escape($ExpectJsonSubstring)) {
                    Write-Phase $Phase "HTTP 200 但响应未包含 '$ExpectJsonSubstring'，继续等待"
                } else {
                    Write-Phase $Phase "$Url 就绪（第 $attempt 次探测，HTTP 200）"
                    return 0
                }
            }
        } catch {
            # 连接被拒绝/超时属启动中的正常现象，静默重试
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
    Write-Phase $Phase "$Url 在 ${TimeoutSeconds}s 内未就绪（共探测 $attempt 次）"
    return 1
}

# 定位 Python 3.12：优先 py 启动器，其次 python。返回可执行文件路径。
function Resolve-Python {
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) {
        $ver = & py.exe -3.12 --version 2>$null
        if ($LASTEXITCODE -eq 0) { return 'py.exe' }
    }
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python) { return 'python.exe' }
    throw '未找到 Python（要求 3.12）。请先安装 Python 3.12 或确认 py 启动器可用。'
}

# 定位无头截图用浏览器：先查 PATH，再查 Windows 标准安装位置（Edge 常不在 PATH）。
# 返回浏览器 exe 的完整路径；找不到返回 $null。
function Resolve-Browser {
    $cmd = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cmd = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
    return $null
}
