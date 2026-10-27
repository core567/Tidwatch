# TideWatch 3D 场景交付包

程序化 3D 河流场景（Three.js / React Three Fiber），可独立运行，完成后按
[`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) 接回 TideWatch 主项目。

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5180
npm run typecheck
npm run build
```

## 文档
- `INTEGRATION_GUIDE.md`：技术栈、入口、节点 ID、相机接口、AI 联动、状态结构、接回步骤
- `SCENE_REQUIREMENTS.md`：新场景的地形/水体/植被/设施/性能/坐标规范

## 说明
- 数据来自 `src/mock/data.ts`，仅用于独立预览；不包含后端、数据库、密钥与小程序。
- 核心 3D 代码在 `src/threeD/`，与主项目 `frontend/src/features/threeD/` 同源。
