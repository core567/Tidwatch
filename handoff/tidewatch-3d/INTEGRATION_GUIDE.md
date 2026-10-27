# TideWatch 3D 场景集成指南（INTEGRATION_GUIDE）

本包是 TideWatch 当前 3D 河流场景的**可独立运行副本**，交给负责程序化建模的同学。
你在本包内开发/替换场景，完成后按本文第 9 节接回主项目。**不要 Blender，全部用 Three.js / React Three Fiber 程序化生成。**

---

## 1. 技术栈与版本

| 依赖 | 版本 | 用途 |
|---|---|---|
| react / react-dom | ^18.3 | UI 框架 |
| three | ^0.169 | 3D 引擎 |
| @react-three/fiber | ^8.17 | React 渲染器 |
| @react-three/drei | ^9.114 | OrbitControls / Html 等 |
| zustand | ^5.0 | 相机状态（与主项目同一 store） |
| typescript | ~5.6 / vite ^5.4 | 构建 |

Node 建议 ≥ 20。主项目锁文件用 npm（`package-lock.json`）。

---

## 2. 目录与入口

```
src/
  main.tsx                     # 独立应用入口
  App.tsx                      # 独立演示页（工具栏 + Canvas + 节点面板）
  types/contract.ts            # 最小类型（接回主项目时改用 @/types/contract）
  mock/data.ts                 # 示例数据（接回时替换为真实 API）
  styles/app.css               # 演示页样式
  threeD/                      # ★ 核心：与主项目 frontend/src/features/threeD 一致
    RiverScene.tsx             # Canvas、灯光、河廊、相机与节点的总装
    RiverCorridor.tsx          # 地形 + 水面（buildValleyGeometry / buildWaterGeometry）
    MonitorNode.tsx            # A/B/C 监测节点（柱状桩体 + drei <Html> 标签）
    CameraRig.tsx              # 订阅 cameraStore 执行平滑飞行
    cameraStore.ts             # ★ 相机唯一控制点（zustand）
    stationViews.ts            # 各节点相机位姿（由曲线切向自动计算）
    riverGeometry.ts           # 河道曲线、锚点、地形/水面/带状几何
    NodeDetailPanelStandalone.tsx  # 独立 mock 详情面板（主项目用 NodeDetailPanel.tsx）
    WebGLErrorBoundary.tsx      # WebGL 不可用时的降级
```

主项目对应页面：`frontend/src/pages/P07River3D/River3DPage.tsx`，路由 `/river-3d`。

---

## 3. 监测点 ID（必须保持不变）

| 断面 | reachId | 沿河参数 t | 业务角色 |
|---|---|---|---|
| 上游 A | `reach-a` | 0.12 | upstream |
| 中游 B | `reach-b` | 0.50 | midstream |
| 下游 C | `reach-c` | 0.88 | downstream |
| 全景 | `overview` | — | 相机复位 |

`t` 定义在 `riverGeometry.ts` 的 `NODE_ANCHORS`。**接回时 reachId 不可改**，因为后端、事件、任务、AI 命令都用这三个 ID。允许调整坐标/曲线，但要同步更新 `NODE_ANCHORS` 与 `RIVER_CURVE`，相机会自动跟随（见第 4、6 节）。

---

## 4. 相机控制接口（cameraStore）

文件：`src/threeD/cameraStore.ts`

```ts
type View3d = 'overview' | 'reach-a' | 'reach-b' | 'reach-c';
useCameraStore.getState().flyTo('reach-a'); // 程序化触发飞行
useCameraStore.getState().flyTo('overview');
// state: view（当前目标）、flying（是否飞行中）、setFlying
```

- `CameraRig` 订阅 `view`，变化时用 OrbitControls 平滑插值（position + target），结束置 `flying=false`。
- 各节点位姿在 `stationViews.ts` 中由河道曲线**自动计算**：相机位于节点上游侧前方并俯视。你更换河道曲线后，只要 t 不变，无需手调镜头。
- 全景位姿常量：`OVERVIEW_CAMERA = { position:[0,26,30], target:[0,0,0], fov:45 }`（`riverGeometry.ts`）。

---

## 5. AI 命令与相机联动

主项目 AI 助手/语音的文本命令经 `frontend/src/lib/commandBus.ts` 解析，白名单命令最终调用同一个 `cameraStore.flyTo`：

| 用户说法 | 命令 | 行为 |
|---|---|---|
| 打开上游 A 的 3D 图 / 聚焦上游 A | `focus3d reach-a` | 不在 /river-3d 时先路由跳转，场景就绪后 flyTo |
| 切换到中游 B / 下游 C | `focus3d reach-b/c` | 同上 |
| 返回河流全景 / 3D 全景 | `focus3d overview` | flyTo('overview') |

**集成要求**：你的新场景必须继续订阅同一 `cameraStore`，保证 AI 说"聚焦上游 A"时镜头真的移动（不只是弹文字）。若你改造相机方案，请保留 `flyTo(view)` 这个外部接口签名。

---

## 6. 节点点击事件

- `MonitorNode` 使用 R3F 的 onClick（含 stopPropagation）。
- 点击后调用 `RiverScene` 的 `onSelectNode(reachId)`（在 App 中由 `setSelected(reachId)` 处理）。
- 节点选中态：`MonitorNode` 读取 `useCameraStore(s => s.view === anchor.reachId)`，同时点击会 `flyTo(reachId)`。
- 独立包用 `NodeDetailPanelStandalone`（mock 数据）展示点击后的信息；主项目用真实 `NodeDetailPanel.tsx`（官方快照 / MQTT 模拟观测 / 关联事件 / 状态机操作）。

**必须保留的交互**：点击 A/B/C → 相机飞行 + 节点高亮 + 展示详情；关闭详情 → 回到全景。

---

## 7. 监测状态数据结构

`RiverScene` 的 props（接回时由 `River3DPage` 从 API 注入）：

```ts
interface RiverSceneProps {
  reaches: Reach[];            // 三个断面，含 onlineStatus: 'ONLINE'|'STALE'|'OFFLINE'
  abnormalReachIds: string[];  // 有进行中事件的断面
  onSelectNode: (reachId: string) => void;
}
```

```ts
interface Reach {
  reachId: string; name: string;
  role: 'upstream'|'midstream'|'downstream';
  topoOrder: number;
  onlineStatus: 'ONLINE'|'STALE'|'OFFLINE';
  lastSeenAt: string | null;
}
```

- 节点颜色由 `onlineStatus` 决定（在线青绿 / 陈旧橙 / 离线灰蓝，见 `MonitorNode.tsx` 的 `COLOR`）。
- `abnormalReachIds` 命中时节点显示红色脉冲光圈。
- 真实数据源（主项目）：`GET /api/reaches`、`GET /api/events?status=ACTIVE`、每断面 `GET /api/reaches/{id}/latest`。
- 数据来源严格区分：MQTT 模拟（SIMULATED，连续）vs 官方自动站（OFFICIAL_AUTO，每日快照，不画成连续曲线）。

---

## 8. 需要保留的现有交互清单

1. OrbitControls：轨道旋转/缩放/平移，阻尼。
2. 相机飞行：节点点击、AI/语音命令、工具栏按钮三条路径都走 cameraStore。
3. 水面流动纹理动画（`RiverCorridor` 中 useFrame 偏移贴图）。
4. 节点脉冲光圈（异常）、光柱、drei Html 文字标签。
5. 雾、阴影、清屏色 `#dfe9f1`；WebGL 失败由 `WebGLErrorBoundary` 降级提示。
6. 场景常驻、不随节点选择销毁重建（只动相机）。

---

## 9. 新场景如何接回 TideWatch

1. 把你新/改的 `riverGeometry.ts`、`RiverCorridor.tsx`、`MonitorNode.tsx`（以及新增的程序化模型文件）复制到主项目 `frontend/src/features/threeD/`。
2. **保持** `cameraStore.ts` 的 `flyTo(view)` 接口、`RiverScene` 的 props（reaches/abnormalReachIds/onSelectNode）、reachId 不变。
3. 把 `src/types/contract.ts` 中的本地类型改回主项目导入：`import type { Reach } from '@/types/contract'`（本包已在交付副本中改为相对路径以便独立运行）。
4. 删除独立 mock 面板，确认主项目 `NodeDetailPanel.tsx` 仍被 `River3DPage.tsx` 使用。
5. 在主项目执行 `npm install && npm run build`，访问 `/river-3d` 验证：三节点、点击飞行、AI 命令"聚焦上游 A / 返回全景"、在线与异常颜色。
6. 不要把本包的 mock 数据、独立 App.tsx 合并进主项目业务代码。

---

## 10. 独立运行方式

```bash
cd tidewatch-3d
npm install
npm run dev        # http://localhost:5180
npm run typecheck
npm run build
```

独立包**不包含**后端、数据库、AI Key、小程序；数据来自 `src/mock/data.ts`。
