import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pager,
  Table,
  Td,
  Th,
  Tag,
} from '@/components/ui';
import { EventStatusBadge, formatTime, reachName } from '@/components/EventBits';
import { useStreamState } from '@/store/stream';
import type { ActiveEvent } from '@/types/contract';

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'ACTIVE', label: '活动' },
  { value: 'RECOVERED', label: '已恢复' },
  { value: 'UNRESOLVED', label: '无法判定' },
];

const PAGE_SIZE = 10;

/**
 * 05 事件复盘与报告：复盘列表。
 * 列表只呈现事件真实业务状态；恢复评估（RECOVERED_SUPPORTED 等）是另一套只读结论，
 * 不在列表把它当作事件状态，也不因 status=RECOVERED 显示“评估通过”。
 */
export default function ReviewListPage() {
  const navigate = useNavigate();
  const stream = useStreamState();
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(t);
  }, [keyword]);

  useEffect(() => setPage(1), [status, debounced]);

  const q = useQuery({
    queryKey: ['review-events', status, debounced, page],
    queryFn: () =>
      api.events({
        status: status || undefined,
        q: debounced || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  const total = q.data?.total ?? 0;
  const events = (q.data?.items ?? []) as ActiveEvent[];
  const filterLabel = STATUS_FILTERS.find((f) => f.value === status)?.label ?? '全部';
  const activeFilter = !!(status || debounced);

  return (
    <div className="tw-stack">
      <PageHeader
        code="P05"
        title="事件复盘与报告"
        badges={
          <>
            <Tag tone={stream === 'open' ? 'ok' : 'muted'}>
              实时 {stream === 'open' ? '已连接' : '未连接'}
            </Tag>
            <Tag tone="outline">列表显示事件业务状态，恢复评估在详情页</Tag>
          </>
        }
        description="选择已发生的异常事件进入复盘：统一时间线、处置前后对比、恢复评估与现场记录。"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
              ← 返回监测总览
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/reports')}>
              月报统计
            </Button>
          </>
        }
      />

      <Card
        title={`事件列表 · ${filterLabel}（${total}）`}
        subtitle="事件状态来自状态机；恢复评估结论在单事件复盘页单独给出"
        padded={false}
        actions={
          <Button size="sm" variant="ghost" onClick={() => q.refetch()}>
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
            <select
              className="tw-filter-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {q.isLoading && <div className="state-box">加载中…</div>}
        {q.isError && (
          <div className="state-box">
            加载失败：{(q.error as Error).message}
            <Button size="sm" onClick={() => q.refetch()}>
              重试
            </Button>
          </div>
        )}
        {!q.isLoading && !q.isError && events.length === 0 && (
          <EmptyState
            title={activeFilter ? '没有符合条件的事件' : '暂无可复盘的事件'}
            description={
              activeFilter ? '尝试调整关键字或状态筛选。' : '运行 S2/S3 场景产生异常事件后可在此复盘。'
            }
          />
        )}

        {events.length > 0 && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>事件</Th>
                  <Th>当前状态</Th>
                  <Th>优先级</Th>
                  <Th>涉及河段</Th>
                  <Th>首发时间</Th>
                  <Th>最近更新</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.eventId}
                    className="tw-table-row-click"
                    onClick={() => navigate(`/review/${e.eventId}`)}
                  >
                    <Td>
                      <div style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>{e.title}</div>
                      <div className="tw-tiny">{e.eventId} · v{e.version}</div>
                    </Td>
                    <Td>
                      <EventStatusBadge status={e.status} />
                    </Td>
                    <Td>
                      <Tag tone={e.priority === 'HIGH' ? 'danger' : 'muted'}>
                        {e.priority === 'HIGH' ? '高' : e.priority === 'LOW' ? '低' : '普通'}
                      </Tag>
                    </Td>
                    <Td>{e.scopeReachIds.map(reachName).join(' → ') || '—'}</Td>
                    <Td className="tw-tiny">{formatTime(e.firstSeenAt)}</Td>
                    <Td className="tw-tiny">{formatTime(e.updatedAt)}</Td>
                    <Td>
                      <Button size="sm" variant="ghost">
                        复盘 ›
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
