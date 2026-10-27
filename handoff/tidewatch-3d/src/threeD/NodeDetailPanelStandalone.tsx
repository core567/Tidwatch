import type { Reach } from '../types/contract';
import { mockObservations, mockEvents } from '../mock/data';

/**
 * 独立版节点详情面板：使用本地 mock 数据，演示节点点击后的信息结构。
 *
 * 主项目对应文件为 frontend/src/features/threeD/NodeDetailPanel.tsx，
 * 集成时用真实版本替换（它通过 api.latest / api.officialAuto / api.events 取数）。
 * 3D 建模只需保证：点击节点 → onSelectNode(reachId)；关闭 → onClose()。
 */
export default function NodeDetailPanelStandalone({ reach, onClose }: { reach: Reach; onClose: () => void }) {
  const obs = mockObservations[reach.reachId] ?? [];
  const events = mockEvents[reach.reachId] ?? [];
  return (
    <aside style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>{reach.name}</b>
        <button onClick={onClose} aria-label="返回全景">×</button>
      </div>
      <div className="tw-tiny" style={{ opacity: 0.7, margin: '4px 0 12px' }}>
        {reach.role} · {reach.reachId} · 在线状态 {reach.onlineStatus}
      </div>

      <div className="tw-section-title">连续观测（示例）</div>
      {obs.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>暂无观测</div>
      ) : (
        <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
          {obs.map((o) => (
            <li key={o.observationId}>{o.metric}：{o.value} {o.unit}（{o.qualityFlag}）</li>
          ))}
        </ul>
      )}

      <div className="tw-section-title" style={{ marginTop: 12 }}>关联事件（示例）</div>
      {events.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>无未闭环事件</div>
      ) : (
        events.map((e) => (
          <div key={e.eventId} style={{ fontSize: 12.5, marginTop: 4 }}>
            {e.eventId} · {e.title} · {e.status}
          </div>
        ))
      )}
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 16,
  top: 16,
  width: 280,
  maxHeight: '70vh',
  overflow: 'auto',
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 14,
  fontSize: 14,
  zIndex: 10,
};
