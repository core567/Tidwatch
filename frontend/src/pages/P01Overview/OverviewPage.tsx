import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import { OnlineBadge, RelativeTime, SourceTag } from '@/components/StatusBits';
import type { Observation, Reach } from '@/types/contract';

export default function OverviewPage() {
  const navigate = useNavigate();
  const authenticated = useAuthStore((s) => s.authenticated);
  const streamState = useRealtimeStream(authenticated);

  const reachesQ = useQuery({
    queryKey: ['reaches'],
    queryFn: api.reaches,
    enabled: authenticated,
    refetchInterval: 15000,
  });

  if (!authenticated) {
    return (
      <div className="card state-box">
        <div>请先登录查看监测数据</div>
        <button className="btn-primary" onClick={() => navigate('/login')}>
          前往登录
        </button>
      </div>
    );
  }

  if (reachesQ.isLoading) return <div className="state-box">加载中…</div>;
  if (reachesQ.isError)
    return (
      <div className="state-box">
        <div>断面数据加载失败：{(reachesQ.error as Error).message}</div>
        <button className="btn-primary" onClick={() => reachesQ.refetch()}>
          重试
        </button>
      </div>
    );

  const reaches = reachesQ.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)' }}>P01 综合监测总览</h2>
        <span className={`badge ${streamState === 'open' ? 'badge-ok' : 'badge-offline'}`}>
          实时通道：{streamState === 'open' ? '已连接' : streamState === 'connecting' ? '连接中' : '未连接'}
        </span>
        <SourceTag source="SIMULATED" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {reaches.map((r) => (
          <ReachCard key={r.reachId} reach={r} onClick={() => navigate(`/reaches/${r.reachId}`)} />
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.9 }}>
          监测点为逻辑节点（上游 A / 中游 B / 下游 C），官方候选断面（新沟 / 宗关 / 龙王庙）坐标与上下游关系待核实，
          当前标注「示意拓扑」。连续观测来自 MQTT 模拟链路；官方月报仅提供月度水质类别背景。
        </div>
      </div>
    </div>
  );
}

function ReachCard({ reach, onClick }: { reach: Reach; onClick: () => void }) {
  const latestQ = useQuery({
    queryKey: ['latest', reach.reachId],
    queryFn: () => api.latest(reach.reachId),
    refetchOnWindowFocus: false,
  });
  const metrics = (latestQ.data ?? []) as Observation[];

  return (
    <div className="card" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }} onClick={onClick}>
      <div
        style={{
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--tw-border)',
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tw-primary-800)' }}>{reach.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {reach.reachId}
            {reach.officialCandidateName ? ` · 候选断面 ${reach.officialCandidateName}` : ''}
          </div>
        </div>
        <OnlineBadge status={reach.onlineStatus} />
      </div>
      <div style={{ padding: '14px 18px' }}>
        {metrics.length === 0 && <div className="muted" style={{ fontSize: 13 }}>暂无观测数据</div>}
        {metrics.map((m) => (
          <div
            key={m.metric}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}
          >
            <span className="muted">{metricName(m.metric)}</span>
            <span>
              <b>{m.value}</b> {m.unit}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <RelativeTime iso={reach.lastSeenAt} />
          <span className="muted">查看详情 ›</span>
        </div>
      </div>
    </div>
  );
}

function metricName(key: string): string {
  return { waterLevel: '水位', turbidity: '浊度', flowLevel: '水流等级' }[key] ?? key;
}
