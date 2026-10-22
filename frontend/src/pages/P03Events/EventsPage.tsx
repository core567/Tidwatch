import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import { EventStatusBadge, reachName, shortTime } from '@/components/EventBits';
import type { ActiveEvent } from '@/types/contract';

const FILTERS = [
  { value: 'ACTIVE', label: '活动事件' },
  { value: '', label: '全部' },
  { value: 'RECOVERED', label: '已恢复' },
  { value: 'UNRESOLVED', label: '无法判定' },
];

export default function EventsPage() {
  const navigate = useNavigate();
  const authenticated = useAuthStore((s) => s.authenticated);
  const stream = useRealtimeStream(authenticated);
  const [status, setStatus] = useState('ACTIVE');

  const eventsQ = useQuery({
    queryKey: ['events', status],
    queryFn: () => api.events({ status: status || undefined, pageSize: 100 }),
    enabled: authenticated,
    refetchInterval: 15000,
  });

  if (!authenticated) return <div className="card state-box">请先登录</div>;

  const events = (eventsQ.data?.items ?? []) as ActiveEvent[];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)' }}>P03 异常事件中心</h2>
        <span className={`badge ${stream === 'open' ? 'badge-ok' : 'badge-offline'}`}>
          实时：{stream === 'open' ? '已连接' : '未连接'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              style={{
                padding: '5px 12px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--tw-border)',
                background: status === f.value ? 'var(--tw-primary-800)' : '#fff',
                color: status === f.value ? '#fff' : 'var(--tw-text)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {eventsQ.isLoading && <div className="state-box">加载中…</div>}
        {eventsQ.isError && (
          <div className="state-box">
            加载失败：{(eventsQ.error as Error).message}
            <button className="btn-primary" onClick={() => eventsQ.refetch()}>重试</button>
          </div>
        )}
        {!eventsQ.isLoading && events.length === 0 && (
          <div className="state-box">
            <div>当前没有{status === 'ACTIVE' ? '活动' : ''}事件</div>
            <div className="muted" style={{ fontSize: 13 }}>
              运行 simulator 的 S2/S3 场景可产生事件（见 simulator/README.md）
            </div>
          </div>
        )}
        {events.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--tw-text-secondary)', background: '#f7fafc' }}>
                <Th>事件 ID</Th>
                <Th>标题</Th>
                <Th>状态</Th>
                <Th>优先级</Th>
                <Th>涉及范围</Th>
                <Th>版本</Th>
                <Th>首发时间</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.eventId}
                  onClick={() => navigate(`/events/${e.eventId}/workbench`)}
                  style={{ borderTop: '1px solid var(--tw-border)', cursor: 'pointer' }}
                >
                  <Td>
                    <b style={{ color: 'var(--tw-accent)' }}>{e.eventId}</b>
                  </Td>
                  <Td>{e.title}</Td>
                  <Td>
                    <EventStatusBadge status={e.status} />
                  </Td>
                  <Td>
                    <span className={e.priority === 'HIGH' ? 'badge badge-danger' : 'badge badge-ok'}>
                      {e.priority === 'HIGH' ? '高' : '普通'}
                    </span>
                  </Td>
                  <Td>{e.scopeReachIds.map(reachName).join(' → ') || '—'}</Td>
                  <Td>v{e.version}</Td>
                  <Td className="muted">{shortTime(e.firstSeenAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', fontWeight: 500, fontSize: 12.5 }}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={className} style={{ padding: '11px 14px' }}>{children}</td>;
}
