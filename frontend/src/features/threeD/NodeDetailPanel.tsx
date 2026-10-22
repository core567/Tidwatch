import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { OnlineBadge, SourceTag } from '@/components/StatusBits';
import type { Reach } from '@/types/contract';

const METRIC_NAME: Record<string, string> = {
  waterLevel: '水位',
  turbidity: '浊度',
  flowLevel: '水流等级',
};

/** 3D 页面内的节点详情面板；数据与 P02 同源（/latest）。 */
export default function NodeDetailPanel({
  reach,
  onClose,
}: {
  reach: Reach;
  onClose: () => void;
}) {
  const latestQ = useQuery({
    queryKey: ['latest', reach.reachId],
    queryFn: () => api.latest(reach.reachId),
    refetchInterval: 5000,
  });
  const metrics = latestQ.data ?? [];

  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        top: 14,
        width: 280,
        background: 'rgba(255,255,255,.96)',
        borderRadius: 10,
        boxShadow: 'var(--tw-shadow)',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <b style={{ fontSize: 15, color: 'var(--tw-primary-800)' }}>{reach.name}</b>
        <OnlineBadge status={reach.onlineStatus} />
        <button
          onClick={onClose}
          style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#8aa0b8' }}
          aria-label="返回全景"
        >
          ✕
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        {reach.reachId}
        {reach.officialCandidateName ? ` · 候选断面 ${reach.officialCandidateName}` : ''}
        <br />
        坐标未核实，当前为示意拓扑
      </div>

      {latestQ.isLoading && <div className="muted" style={{ fontSize: 13 }}>指标加载中…</div>}
      {metrics.map((m) => (
        <div key={m.metric} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
          <span className="muted">{METRIC_NAME[m.metric] ?? m.metric}</span>
          <span>
            <b>{m.value}</b> {m.unit}
          </span>
        </div>
      ))}
      {metrics.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <SourceTag source={metrics[0].sourceType} />
        </div>
      )}
      {reach.onlineStatus !== 'ONLINE' && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--tw-watch)' }}>
          最后有效观测：{reach.lastSeenAt ? new Date(reach.lastSeenAt).toLocaleString('zh-CN') : '无'}
        </div>
      )}
    </div>
  );
}
