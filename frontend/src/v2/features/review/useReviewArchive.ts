import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import type { ActiveEvent } from '@/types/contract';

export const ARCHIVE_PAGE_SIZE = 8;
export const PRIORITY_FILTERS = [
  { value: '', label: '全部' },
  { value: 'HIGH', label: '高风险' },
  { value: 'NORMAL', label: '中风险' },
  { value: 'LOW', label: '低风险' },
] as const;

export interface ArchiveBucket {
  label: string;
  count: number;
}

export interface ArchiveStats {
  total30d: number;
  highRisk: number;
  avgCloseMs: number | null;
  closedCount: number;
  archived: number;
  active: number;
  unresolved: number;
  total: number;
  buckets: ArchiveBucket[];
}

const DAY_MS = 86400_000;

function firstSeenMs(e: ActiveEvent): number {
  return Date.parse(e.firstSeenAt);
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

function buildStats(items: ActiveEvent[]): ArchiveStats {
  const now = Date.now();
  const cutoff = now - 30 * DAY_MS;
  const recent = items.filter((e) => {
    const t = firstSeenMs(e);
    return Number.isFinite(t) && t >= cutoff;
  });

  const closed = recent.filter((e) => e.status === 'RECOVERED' || e.status === 'UNRESOLVED');
  // 事件状态机没有“归档”状态：只有 RECOVERED 可进入复盘归档，UNRESOLVED 计入闭环但不归档。
  const archived = recent.filter((e) => e.status === 'RECOVERED').length;
  const active = recent.length - closed.length;
  const unresolved = recent.filter((e) => e.status === 'UNRESOLVED').length;
  const durations = closed
    .map((e) => Date.parse(e.updatedAt) - firstSeenMs(e))
    .filter((v) => Number.isFinite(v) && v >= 0);
  const avgCloseMs = durations.length
    ? durations.reduce((sum, v) => sum + v, 0) / durations.length
    : null;

  // 近 30 日按 5 天一档（6 档），时间为真实事件首发时间
  const buckets: ArchiveBucket[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const start = new Date(now - (i + 1) * 5 * DAY_MS);
    const end = new Date(now - i * 5 * DAY_MS);
    const label = `${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const count = recent.filter((e) => {
      const t = firstSeenMs(e);
      return t >= start.getTime() && t < end.getTime();
    }).length;
    buckets.push({ label, count });
  }

  return {
    total30d: recent.length,
    highRisk: recent.filter((e) => e.priority === 'HIGH').length,
    avgCloseMs,
    closedCount: closed.length,
    archived,
    active,
    unresolved,
    total: items.length,
    buckets,
  };
}

export function useReviewArchive(params: {
  page: number;
  query: string;
  priority: string;
}) {
  const statsQ = useQuery({
    queryKey: ['v2-review-archive-stats'],
    queryFn: () => api.events({ page: 1, pageSize: 200 }),
    refetchInterval: 30000,
  });

  const listQ = useQuery({
    queryKey: ['v2-review-archive-list', params.page, params.query, params.priority],
    queryFn: () =>
      api.events({
        page: params.page,
        pageSize: ARCHIVE_PAGE_SIZE,
        q: params.query || undefined,
        priority: params.priority || undefined,
      }),
    refetchInterval: 15000,
  });

  const stats = useMemo(
    () => buildStats((statsQ.data?.items ?? []) as ActiveEvent[]),
    [statsQ.data],
  );

  return {
    stats,
    statsTotal: statsQ.data?.total ?? 0,
    statsLoading: statsQ.isLoading,
    statsError: statsQ.error,
    list: (listQ.data?.items ?? []) as ActiveEvent[],
    total: listQ.data?.total ?? 0,
    listLoading: listQ.isLoading,
    listError: listQ.error,
    refetch: () => {
      void statsQ.refetch();
      void listQ.refetch();
    },
  };
}

/** 左栏列表项风险码：按真实 priority 映射，不推断事件等级。 */
export function priorityMeta(priority: ActiveEvent['priority']) {
  if (priority === 'HIGH') return { code: 'R3', label: '高风险', tone: 'high' as const };
  if (priority === 'LOW') return { code: 'R1', label: '低风险', tone: 'low' as const };
  return { code: 'R2', label: '中风险', tone: 'medium' as const };
}
