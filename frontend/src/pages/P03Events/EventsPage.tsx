import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useStreamState } from '@/store/stream';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pager,
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
  const stream = useStreamState();
  const [status, setStatus] = useState('ACTIVE');
  const [priority, setPriority] = useState('');
  const [reachId, setReachId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const pageSize = 10;

  // 关键字防抖
  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(t);
  }, [keyword]);

  // 任一筛选条件变化回到第 1 页
  useEffect(() => setPage(1), [status, priority, reachId, debounced]);

  const eventsQ = useQuery({
    queryKey: ['events', status, priority, reachId, debounced, page],
    queryFn: () =>
      api.events({
        status: status || undefined,
        priority: priority || undefined,
        reachId: reachId || undefined,
        q: debounced || undefined,
        page,
        pageSize,
      }),
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  const total = eventsQ.data?.total ?? 0;
  const events = (eventsQ.data?.items ?? []) as ActiveEvent[];
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 9;
      const sb = STATUS_ORDER[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
    });
  }, [events]);

  const filterLabel = FILTERS.find((f) => f.value === status)?.label ?? '';
  const hasFilter = !!(priority || reachId || debounced);

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
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
              ← 返回监测总览
            </Button>
            <Segmented
              ariaLabel="筛选事件状态"
              value={status}
              onChange={setStatus}
              options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            />
          </>
        }
      />

      <Card
        title={`${filterLabel}（${total}）`}
        subtitle="触发指标取自事件的首个变化记录；页内按“已升级 → 待初查 → 研判中 → 恢复相关 → 已结束”排序。"
        padded={false}
        actions={
          <Button size="sm" variant="ghost" onClick={() => eventsQ.refetch()}>
            刷新
          </Button>
        }
      >
        <div className="tw-card-body" style={{ paddingBottom: 12 }}>
          <div className="tw-filter-bar">
            <input
              className="tw-filter-input"
              placeholder="搜索事件标题 / 编号"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <select className="tw-filter-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">全部等级</option>
              <option value="HIGH">高优先</option>
              <option value="NORMAL">普通</option>
              <option value="LOW">低优先</option>
            </select>
            <select className="tw-filter-select" value={reachId} onChange={(e) => setReachId(e.target.value)}>
              <option value="">全部节点</option>
              <option value="reach-a">上游 A</option>
              <option value="reach-b">中游 B</option>
              <option value="reach-c">下游 C</option>
            </select>
            <Segmented
              ariaLabel="筛选事件状态"
              value={status}
              onChange={setStatus}
              options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            />
            {hasFilter && (
              <Button size="sm" variant="ghost" onClick={() => { setPriority(''); setReachId(''); setKeyword(''); }}>
                清除筛选
              </Button>
            )}
          </div>
        </div>

        {eventsQ.isLoading && <div className="state-box">加载中…</div>}
        {eventsQ.isError && (
          <div className="state-box">
            加载失败：{(eventsQ.error as Error).message}
            <Button size="sm" onClick={() => eventsQ.refetch()}>重试</Button>
          </div>
        )}
        {!eventsQ.isLoading && !eventsQ.isError && sorted.length === 0 && (
          <EmptyState
            title={hasFilter ? '没有符合筛选条件的事件' : `当前没有${status === 'ACTIVE' ? '活动' : ''}事件`}
            description={
              hasFilter
                ? '尝试调整关键字、等级、节点或状态筛选。'
                : '运行 simulator 的 S2/S3 场景可产生事件（见 simulator/README.md）。'
            }
          />
        )}
        {sorted.length > 0 && (
          <>
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
              {sorted.map((e) => (
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
            <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </>
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
