import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Table,
  Td,
  Th,
  Tag,
} from '@/components/ui';
import { EVENT_STATUS, EventStatusBadge, reachName, shortTime } from '@/components/EventBits';
import { simMetricName, simMetricUnitByKey } from '@/lib/metrics';
import type { ActiveEvent, EventStatus } from '@/types/contract';

const FILTERS = [
  { value: 'ACTIVE', label: '活动事件' },
  { value: '', label: '全部' },
  { value: 'ESCALATED', label: '已升级' },
  { value: 'RECOVERED', label: '已恢复' },
  { value: 'UNRESOLVED', label: '无法判定' },
];

const STATUS_ORDER: Record<EventStatus, number> = {
  ESCALATED: 0,
  OPEN: 1,
  INVESTIGATING: 2,
  RECOVERY_PENDING: 3,
  MONITORING: 4,
  NARROWED: 5,
  RECOVERED: 6,
  UNRESOLVED: 7,
};

const DIRECTION: Record<string, string> = { UP: '↑', DOWN: '↓', LEVEL: '→' };

export default function EventsPage() {
  const navigate = useNavigate();
  const stream = useRealtimeStream();
  const [status, setStatus] = useState('ACTIVE');

  const eventsQ = useQuery({
    queryKey: ['events', status],
    queryFn: () => api.events({ status: status || undefined, pageSize: 100 }),
    refetchInterval: 15000,
  });

  const events = useMemo(() => {
    const items = (eventsQ.data?.items ?? []) as ActiveEvent[];
    return [...items].sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 9;
      const sb = STATUS_ORDER[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
    });
  }, [eventsQ.data]);

  const filterLabel = FILTERS.find((f) => f.value === status)?.label ?? '';

  return (
    <div className="tw-stack">
      <PageHeader
        code="P03"
        title="异常事件中心"
        badges={
          <>
            <Tag tone={stream === 'open' ? 'ok' : 'muted'}>
              实时 {stream === 'open' ? '已连接' : '未连接'}
            </Tag>
            <Tag tone="outline">按状态机语义分组排序</Tag>
          </>
        }
        description="事件由规则识别持续变化后生成；点击任意事件进入研判工作台查看时间线、证据与任务。"
        actions={
          <Segmented
            ariaLabel="筛选事件状态"
            value={status}
            onChange={setStatus}
            options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
        }
      />

      <Card
        title={`${filterLabel}（${eventsQ.data?.total ?? 0}）`}
        subtitle="触发指标取自事件的首个变化记录；排序按“已升级 → 待初查 → 研判中 → 恢复相关 → 已结束”。"
        actions={
          <Button size="sm" variant="ghost" onClick={() => eventsQ.refetch()}>
            刷新
          </Button>
        }
        padded={false}
      >
        {eventsQ.isLoading && <div className="state-box">加载中…</div>}
        {eventsQ.isError && (
          <div className="state-box">
            加载失败：{(eventsQ.error as Error).message}
            <Button size="sm" onClick={() => eventsQ.refetch()}>
              重试
            </Button>
          </div>
        )}
        {!eventsQ.isLoading && !eventsQ.isError && events.length === 0 && (
          <EmptyState
            title={`当前没有${status === 'ACTIVE' ? '活动' : ''}事件`}
            description="运行 simulator 的 S2/S3 场景可产生事件（见 simulator/README.md）。"
          />
        )}
        {events.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>事件</Th>
                <Th>状态</Th>
                <Th>触发指标</Th>
                <Th>涉及范围</Th>
                <Th>优先级</Th>
                <Th>版本</Th>
                <Th>最近更新</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.eventId}
                  className="tw-table-row-click"
                  onClick={() => navigate(`/events/${e.eventId}/workbench`)}
                >
                  <Td>
                    <div style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>{e.title}</div>
                    <div className="tw-tiny">
                      {e.eventId} · 首发 {shortTime(e.firstSeenAt)}
                    </div>
                  </Td>
                  <Td>
                    <EventStatusBadge status={e.status} />
                  </Td>
                  <Td>
                    {e.trigger ? (
                      <span>
                        {reachName(e.trigger.reachId)} · {simMetricName(e.trigger.metric)}{' '}
                        <b style={{ color: 'var(--tw-primary-800)' }}>
                          {DIRECTION[e.trigger.direction] ?? ''}
                          {e.trigger.magnitude}
                        </b>{' '}
                        {simMetricUnitByKey(e.trigger.metric)}
                      </span>
                    ) : (
                      <span className="tw-tiny">—</span>
                    )}
                  </Td>
                  <Td>{e.scopeReachIds.map(reachName).join(' → ') || '—'}</Td>
                  <Td>
                    <Tag tone={e.priority === 'HIGH' ? 'danger' : 'muted'}>
                      {e.priority === 'HIGH' ? '高' : e.priority === 'LOW' ? '低' : '普通'}
                    </Tag>
                  </Td>
                  <Td>v{e.version}</Td>
                  <Td className="tw-tiny">{shortTime(e.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <div className="tw-small tw-muted">
          状态说明：
          {Object.entries(EVENT_STATUS).map(([key, v]) => (
            <span key={key} style={{ marginLeft: 8 }}>
              <Tag tone="outline">{v.text}</Tag>
            </span>
          ))}
          <span style={{ marginLeft: 8 }}>
            终态为已恢复 / 无法判定；活动事件不含终态。
          </span>
        </div>
      </Card>
    </div>
  );
}
