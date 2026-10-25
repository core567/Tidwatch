import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { Button, Card, Tag } from '@/components/ui';
import type { OfficialAutoSyncResult } from '@/types/contract';

function syncSummary(r: OfficialAutoSyncResult): string {
  if (r.skipped) {
    return r.reason === 'DISABLED'
      ? '采集开关关闭，未执行拉取'
      : `命中缓存，下次允许拉取时间：${r.nextAllowedAt ? new Date(r.nextAllowedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}`;
  }
  if (!r.ok) return `拉取失败：${r.errors.join('；') || '未知错误'}`;
  return `拉取完成：${r.stationsOk}/${r.stationsTotal} 站成功，新增 ${r.recordsInserted} 条，已存在 ${r.recordsSkipped} 条${
    r.errors.length ? `；部分失败：${r.errors.join('；')}` : ''
  }`;
}

/** P12 官方实时数据管理：默认关闭，仅手动拉取，带缓存与失败降级。 */
export default function OfficialAutoPanel() {
  const queryClient = useQueryClient();
  const statusQ = useQuery({
    queryKey: ['official-auto-status'],
    queryFn: api.officialAutoStatus,
    refetchInterval: 30000,
  });
  const refresh = useMutation({
    mutationFn: () => api.refreshOfficialAuto(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['official-auto'] });
      queryClient.invalidateQueries({ queryKey: ['official-auto-status'] });
    },
  });

  const status = statusQ.data;
  const last = status?.lastFetch;

  return (
    <Card
      title="官方实时水质数据"
      subtitle={
        status
          ? `${status.sourceLabel} · 缓存 ${status.cacheMinutes} 分钟 · 超过 ${status.staleMinutes} 分钟标记过期`
          : '加载中…'
      }
      actions={
        <>
          <Tag tone={status?.enabled ? 'ok' : 'muted'}>
            {status?.enabled ? '采集已启用' : '采集默认关闭'}
          </Tag>
          <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? '拉取中…' : '立即拉取'}
          </Button>
        </>
      }
    >
      <div className="tw-row tw-small" style={{ marginBottom: 10 }}>
        {status?.stations.map((s) => (
          <Tag key={s.stationName} tone="outline" title={s.note}>
            {s.reachId} ↔ {s.stationName}
          </Tag>
        ))}
      </div>
      <div className="tw-small tw-muted" style={{ marginBottom: 8 }}>
        官方站与逻辑断面为示意关联（上下游对应待核）；平台仅发布当前快照，无历史序列。
        为遵守平台反爬声明，本系统默认不自动抓取，仅在演示时手动拉取，且同一站点 30 分钟内命中缓存。
      </div>
      {last ? (
        <div className="tw-small">
          最近一次：
          <Tag tone={last.ok ? 'ok' : 'danger'}>{last.ok ? '成功' : '失败'}</Tag>{' '}
          {new Date(last.fetchedAt).toLocaleString('zh-CN', { hour12: false })} · 成功站点{' '}
          {last.stationCount} · 新增 {last.recordCount} 条
          {last.durationMs !== null && ` · 耗时 ${last.durationMs} ms`}
          {last.message && (
            <div className="tw-tiny" style={{ marginTop: 4 }}>
              {last.message}
            </div>
          )}
        </div>
      ) : (
        <div className="tw-small tw-muted">尚无拉取记录</div>
      )}
      {refresh.data && (
        <div
          className="tw-small"
          style={{
            marginTop: 8,
            color: refresh.data.ok ? 'var(--tw-ok)' : 'var(--tw-danger)',
          }}
        >
          {syncSummary(refresh.data)}
        </div>
      )}
      {refresh.isError && (
        <div className="tw-small" style={{ marginTop: 8, color: 'var(--tw-danger)' }}>
          拉取请求失败：{(refresh.error as Error).message}
        </div>
      )}
    </Card>
  );
}
