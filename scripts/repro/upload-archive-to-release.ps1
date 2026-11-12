# TideWatch 历史截图归档包上传 GitHub Release 助手（PowerShell 5.1+）
#
# 背景：2026-11-12 将 106 张历史截图移出主分支（提交 ce9464d），归档包保存在仓库外：
#   D:\TideWatch-archive\2026-11-12-screenshot-archive\tidewatch-screenshots-archive-2026-11-12.zip
# 本脚本在具备条件时把该包发布为 GitHub Release 附件；条件不满足时打印手动步骤，不伪造结果。
#
# 前置（二选一）：
#   A) 已安装 gh 并登录：winget install GitHub.cli; gh auth login
#   B) 准备有 repo 权限的 PAT，并设置环境变量 GITHUB_TOKEN
# 另：发布 Release 需要标签已存在于远端，因此请先在确认后 push 分支与标签（当前按要求暂不 push）。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/repro/upload-archive-to-release.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/repro/upload-archive-to-release.ps1 -Tag archive/screenshots-2026-11-12
#
# 退出码：0 已上传或已打印手动步骤（信息性）；1 参数/文件错误。

param(
    [string]$Repo = 'core567/Tidwatch',
    [string]$Tag = 'archive/screenshots-2026-11-12',
    [string]$ArchivePath = 'D:\TideWatch-archive\2026-11-12-screenshot-archive\tidewatch-screenshots-archive-2026-11-12.zip',
    [string]$Sha256Path = 'D:\TideWatch-archive\2026-11-12-screenshot-archive\tidewatch-screenshots-archive-2026-11-12.zip.sha256'
)

. "$PSScriptRoot\common.ps1"

if (-not (Test-Path $ArchivePath)) {
    Write-Phase 'ERROR' "归档包不存在：$ArchivePath"
    exit 1
}

$title = 'Historical screenshots archive (pre-V2, 2026-10-25/26)'
$notes = '106 张 V2 视觉融合前的历史截图，从主分支移出以减小克隆体积。来源提交 8214b71，与仓库历史逐字节一致；SHA-256 见同名 .sha256。'

$gh = Get-Command gh.exe -ErrorAction SilentlyContinue
if ($gh) {
    Write-Phase 'RELEASE' "检测到 gh，创建/更新 Release 并上传附件（tag=$Tag）"
    & gh.exe release create $Tag $ArchivePath $Sha256Path --repo $Repo --title $title --notes $notes
    if ($LASTEXITCODE -eq 0) { Write-Phase 'RESULT' '上传成功'; exit 0 }
    Write-Phase 'WARN' "gh 发布失败（exit=$LASTEXITCODE），可能是未登录或标签未推送。转手动说明。"
} elseif ($env:GITHUB_TOKEN) {
    Write-Phase 'RELEASE' '未安装 gh，检测到 GITHUB_TOKEN，调用 REST API（要求标签已在远端）'
    $headers = @{ Authorization = "Bearer $env:GITHUB_TOKEN"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'tidewatch-repro' }
    $body = @{ tag_name = $Tag; name = $title; body = $notes } | ConvertTo-Json
    try {
        $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/releases" -Headers $headers -Body $body
        $assetUrl = "https://uploads.github.com/repos/$Repo/releases/$($rel.id)/assets?name=$([IO.Path]::GetFileName($ArchivePath))"
        Invoke-RestMethod -Method Post -Uri $assetUrl -Headers ($headers + @{ 'Content-Type' = 'application/zip' }) -InFile $ArchivePath
        Write-Phase 'RESULT' "上传成功：$($rel.html_url)"
        exit 0
    } catch {
        Write-Phase 'WARN' "REST 上传失败：$($_.Exception.Message)。转手动说明。"
    }
} else {
    Write-Phase 'WARN' '未检测到 gh 或 GITHUB_TOKEN，无法自动上传。'
}

Write-Host ''
Write-Phase 'MANUAL' '请按以下任一方式手动上传（完整说明见 scripts/repro/RELEASE-UPLOAD.md）：'
Write-Host '  方式一（gh CLI，推荐）：'
Write-Host "    gh release create $Tag `"$ArchivePath`" `"$Sha256Path`" --repo $Repo --title `"$title`" --notes `"$notes`""
Write-Host '  方式二（网页）：打开 https://github.com/core567/Tidwatch/releases -> Draft a new release ->'
Write-Host '    输入标签 archive/screenshots-2026-11-12 -> 拖入 zip 与 .sha256 两个附件 -> Publish。'
Write-Host ''
Write-Phase 'NOTE' '发布 Release 前需先 push 分支与标签；当前按用户要求暂不 push，待全流程验证后统一处理。'
exit 0
