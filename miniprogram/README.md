# TideWatch 移动巡检端（微信原生小程序 + TypeScript）

TideWatch 智慧河流水环境监测系统的移动端，承担现场巡检任务：任务接收、现场记录、
拍照上传、结果回填；异常事件与监测点信息为只读查看。与 PC Web 监测指挥中心
**共用同一 Python FastAPI 后端、数据库、用户权限与事件业务模型**，不直接连接 MQTT Broker。

> 当前状态：**M0 工程脚手架**。页面与网络层结构完整、可通过类型检查；
> 业务接口将在后端就绪后于 M3 对接。未实现的功能均在代码注释与页面中明确标注。

## 1. 环境要求

- 微信开发者工具（稳定版即可）
- Node.js 18+（仅安装类型定义用，小程序本身无运行时 npm 依赖）
- 后端服务：`backend/`（M1 后提供，默认 `http://<电脑IP>:8000`）

## 2. 导入与 AppID 配置

1. 打开微信开发者工具 → 导入项目，目录选择**本目录 `miniprogram/`**
   （它是独立小程序工程，不是仓库根目录）。
2. AppID 一栏填写你自己的**测试号 AppID**（测试号在 mp.weixin.qq.com 申请）。
   本仓库 `project.config.json` 中 `appid` 留空，不替你填写或编造；
   导入后工具会把你的 AppID 写入本机的 `project.private.config.json`
   （该文件已 gitignore，不会被提交，也不会覆盖别人的配置）。
3. 详情 → 本地设置，建议勾选：
   - 将 TS 编译成 JS（或确认"使用 TypeScript 编译插件"已开启）；
   - **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**
     （开发期访问局域网 `http/ws` 必须勾选）。

## 3. 安装类型定义（命令行一次性）

```bash
cd miniprogram
npm install          # 仅安装 miniprogram-api-typings / typescript
npx tsc --noEmit     # 类型检查，无输出即通过
```

小程序代码无运行时 npm 包，因此**不需要**在开发者工具里点"构建 npm"；
如后续引入运行时依赖，再执行"工具 → 构建 npm"。

## 4. 后端地址配置

集中在 `config/env.ts`：

- 开发者工具模拟器内调试：`HOST = '127.0.0.1'`；
- **真机调试必须改成电脑的局域网 IP**（手机与电脑同一 WiFi），例如
  `HOST = '192.168.1.100'`，并在电脑防火墙放行 8000 端口。
  真机上的 localhost 指向手机自身，这是最常见的连不通原因。
- 正式发布需备案 HTTPS/WSS 域名并在小程序后台配置服务器域名，**不在 V1.0 范围内**。

## 5. 目录说明

```
app.ts/app.json/app.wxss     全局入口、路由与 tabBar、设计 token（深蓝/科技蓝/浅灰）
config/env.ts                后端 REST / WebSocket 地址与超时配置
typings/contract.d.ts        与后端对齐的领域契约（M0 骨架，M1 后由 OpenAPI 生成权威版）
services/api.ts              登录、任务、事件、监测点、上传接口
utils/request.ts             wx.request 封装：JWT、统一错误体、401 跳登录、GET 重试
utils/ws.ts                  WebSocket 单例：鉴权、心跳、指数退避重连、消息幂等、resume
utils/auth.ts                JWT 本地存储与登录态
pages/
  login/                     账号密码登录（JWT，不依赖微信开放平台）
  tasks/ task-detail/        任务列表（tabBar 首页）/ 详情与状态流转
  record/                    现场记录 + wx.chooseMedia 拍照 + wx.uploadFile
  events/ event-detail/      异常事件只读查看
  reaches/ reach-detail/     监测点只读查看
  profile/                   用户信息、实时通道状态、退出登录
components/source-tag/       数据来源标签（官方公开/模拟数据/人工记录）
```

## 6. 实时通信约定（与 PC Web 一致）

- 通道：WebSocket `/api/ws`（PC Web 用 SSE `/api/stream`，后端同一推送 Hub 扇出）。
- 鉴权：连接 URL query 携带 `token=<JWT>`。
- 心跳 25s；断线指数退避重连（1s 起，上限 30s）。
- 每条消息有 `messageId`，客户端幂等去重；重连时带 `resumeFrom` 请求补放，
  页面仍须在连接恢复后重拉一次快照（补放 + 快照双保险，避免漏消息）。
- 消息信封与 `StreamMessage` 类型见 `typings/contract.d.ts`。

## 7. 数据口径（演示诚信要求）

- MQTT 模拟链路的连续观测一律带「模拟数据」标签；官方月报仅为月度水质类别背景，
  不展示为连续曲线；站点坐标未核实前使用逻辑点 A/B/C 并标「示意拓扑」。
- 巡检照片只保存附件与人工记录，V1.0 不做图像自动判级；现场结论必须人工确认。
