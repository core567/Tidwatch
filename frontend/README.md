# TideWatch PC Web（监测指挥中心）

React 18 + TypeScript + Vite。综合监测、事件研判、3D 河流数字空间、巡检派发、历史报告、系统管理。

## 启动

```bash
cd frontend
npm install        # 如默认源慢：npm install --registry=https://registry.npmmirror.com
npm run dev        # http://localhost:5173
```

开发期 Vite 把 `/api` 代理到 `http://127.0.0.1:8000`（见 `vite.config.ts`），
需先启动后端（见 ../backend/README.md）。

其他命令：

```bash
npm run typecheck  # 仅类型检查
npm run build      # 类型检查 + 生产构建到 dist/
```

## 页面与里程碑

| 路由 | 页面 | 里程碑 |
|---|---|---|
| `/` P01 | 综合监测总览 | M1 |
| `/reaches/:reachId` P02 | 断面详情 | M1 |
| `/events` P03 | 异常事件中心 | M2 |
| `/events/:id/workbench` P04 | 演化研判工作台 | M2 |
| `/tasks` P05 | 巡检与观察任务 | M3 |
| `/evidence` P06 | 证据与智能分析 | M3 |
| `/river-3d` P07 | 3D 河流数字空间（react-three-fiber） | M1 全景 / M2 飞行联动 / M3 完善 |
| `/reviews` P08 | 研判单与复盘 | M3 |
| `/reports` P09 | 历史分析与报告 | M3 |
| `/mobile` P10 | 移动端说明（小程序为独立工程 ../miniprogram） | M3 |
| `/field-voice` P11 | 语音与现场感知 | M3 |
| `/admin` P12 | 系统管理与运行诊断 | M1 起 |

M0 阶段业务页为标注里程碑的占位骨架；P01/P12 已接入真实 `/api/health`。

## 工程约定

- 所有后端访问集中在 `src/services/apiClient.ts`，页面不散落 fetch；
- 实时推送使用 `src/services/sse.ts`（自动重连、Last-Event-ID 补放、幂等）；
- 契约类型见 `src/types/contract.ts`，与后端 Pydantic schema 对齐（M1 起改由 OpenAPI 生成）；
- 设计 token 见 `src/styles/tokens.css`：深蓝/科技蓝/浅灰，语义色必须配文字标签。

## 演示账号

admin / analyst / inspector，密码见 ../backend/README.md。
