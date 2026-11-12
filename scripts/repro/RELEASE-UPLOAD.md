# 历史截图归档包上传 GitHub Release 操作说明

## 背景

2026-11-12 优化克隆体积时，将 106 张 V2 视觉融合前的历史截图移出主分支（提交 `ce9464d`）。
文件未删除，有两份独立保障：

1. **Git 历史**：永久保留在提交 `8214b71` 及之前，可 `git checkout 8214b71 -- docs/screenshots/` 恢复。
2. **离线归档包**（逐字节一致，已校验）：
   - 路径：`D:\TideWatch-archive\2026-11-12-screenshot-archive\tidewatch-screenshots-archive-2026-11-12.zip`
   - SHA-256：`aa89eb2eb02cb4d9d7d7b4d74fd25037fba727c8caccc913a38c3b533da6f676`
   - 清单与恢复方法：同目录 `MANIFEST.md`

本说明描述如何把离线归档包发布为 GitHub Release 附件，作为公开的第三份分发渠道。
**当前阶段按要求暂不 push、暂不上传；待全流程验证、用户确认 push 后再执行。**

## 前置条件

- 分支与标签已 push 到远端（Release 需要一个远端标签）。
- 具备 `core567/Tidwatch` 仓库的发布权限，二选一：
  - 已安装并登录 GitHub CLI：`winget install GitHub.cli` 后 `gh auth login`；
  - 或准备有 `repo` 权限的 Personal Access Token（PAT）。

## 方式一：gh CLI（推荐）

```powershell
# 1) push 分支（用户确认后）
git push origin fusion/f2-overview-migration

# 2) 创建并推送标签
git tag archive/screenshots-2026-11-12
git push origin archive/screenshots-2026-11-12

# 3) 一条命令创建 Release 并上传 zip + 校验和
gh release create archive/screenshots-2026-11-12 `
  "D:\TideWatch-archive\2026-11-12-screenshot-archive\tidewatch-screenshots-archive-2026-11-12.zip" `
  "D:\TideWatch-archive\2026-11-12-screenshot-archive\tidewatch-screenshots-archive-2026-11-12.zip.sha256" `
  --repo core567/Tidwatch `
  --title "Historical screenshots archive (pre-V2, 2026-10-25/26)" `
  --notes "106 张 V2 视觉融合前历史截图，来源提交 8214b71，与仓库历史逐字节一致。"
```

也可直接运行助手脚本（会自动检测 gh / GITHUB_TOKEN）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/repro/upload-archive-to-release.ps1
```

## 方式二：网页手动上传

1. 打开 https://github.com/core567/Tidwatch/releases ，点击 **Draft a new release**。
2. Tag 输入 `archive/screenshots-2026-11-12`（若标签未建，GitHub 会在此创建）。
3. 把以下两个文件拖入 Attachments：
   - `tidewatch-screenshots-archive-2026-11-12.zip`
   - `tidewatch-screenshots-archive-2026-11-12.zip.sha256`
4. 填写标题与说明后 **Publish release**。

## 上传后校验（供下载者）

```powershell
# 下载后比对 SHA-256，应与 .sha256 文件及 MANIFEST 记录一致
Get-FileHash tidewatch-screenshots-archive-2026-11-12.zip -Algorithm SHA256
# 期望：AA89EB2EB02CB4D9D7D7B4D74FD25037FBA727C8CACCC913A38C3B533DA6F676
```

## 红线提醒

- 上传/发布属于公开发布动作，必须等用户明确批准后执行。
- 不得在文档中声称 Release “已发布”，除非附件确实可在远端下载并通过校验。
