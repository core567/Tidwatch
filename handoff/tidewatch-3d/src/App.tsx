import { useState } from 'react';
import RiverScene from './threeD/RiverScene';
import NodeDetailPanelStandalone from './threeD/NodeDetailPanelStandalone';
import { useCameraStore, type View3d as FocusTarget } from './threeD/cameraStore';
import { mockReaches, mockAbnormal } from './mock/data';
import './styles/app.css';

/**
 * 独立演示入口：
 * - 渲染 TideWatch 当前河廊与 A/B/C 监测节点；
 * - 点击 3D 节点或右侧按钮，通过 cameraStore.flyTo 切换相机（与主项目一致）；
 * - AI commandBus 在主项目中调用同一 store，详见 INTEGRATION_GUIDE.md。
 */
export default function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const flyTo = useCameraStore((s) => s.flyTo);

  const focus = (target: FocusTarget) => {
    if (target === 'overview') {
      setSelected(null);
      flyTo('overview');
    } else {
      setSelected(target);
      flyTo(target);
    }
  };

  const reach = mockReaches.find((r) => r.reachId === selected);

  return (
    <div className="handoff-root">
      <div className="handoff-toolbar">
        <b>TideWatch 3D 场景独立预览</b>
        <span className="hint">相机控制 / A·B·C 节点（mock 数据）</span>
        <div className="spacer" />
        <button onClick={() => focus('overview')}>河流全景</button>
        <button onClick={() => focus('reach-a')}>上游 A</button>
        <button onClick={() => focus('reach-b')}>中游 B</button>
        <button onClick={() => focus('reach-c')}>下游 C</button>
      </div>

      <div className="handoff-canvas">
        <RiverScene
          reaches={mockReaches}
          abnormalReachIds={mockAbnormal}
          onSelectNode={(id) => setSelected(id)}
        />
        {reach && <NodeDetailPanelStandalone reach={reach} onClose={() => focus('overview')} />}
      </div>
    </div>
  );
}
