import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import type { OfficialAutoStatus, OfficialAutoSyncResult } from '@/types/contract';
import { formatTime } from '@/components/EventBits';
import { Badge } from '../../components/ui/Badge';
import { Panel } from '../../components/ui/Panel';

function summary(r: OfficialAutoSyncResult): string {
  if (r.skipped) return r.reason === 'DISABLED' ? '采集开关关闭，未执行拉取' : '命中缓存，未重复拉取';
  if (!r.ok) return `拉取失败：${r.errors.join('；') || '未知错误'}`;
  return `拉取完成：${r.stationsOk}/${r.stationsTotal} 站成功，新增 ${r.recordsInserted} 条，跳过 ${r.recordsSkipped} 条`;
}

export function OfficialAutoPanel({
  status, error, loading, onRetry,
}: {
  status?: OfficialAutoStatus;
  error?: Error | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const qc = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => api.refreshOfficialAuto(true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['official-auto'] });
      qc.invalidateQueries({ queryKey: ['official-auto-status'] });
      qc.invalidateQueries({ queryKey: ['diagnostics'] });
    },
  });
  const last = status?.lastFetch;

  return (
    <Panel
      code="06"
      title="官方实时数据"
      en="OFFICIAL AUTO"
      className="v2-sys-panel"
      actions={
        <>
          <Badge tone={status?.enabled ? 'live' : 'mid'}>{status?.enabled ? '采集开启' : '采集关闭'}</Badge>
          <button
            type="button"
            className="v2-btn v2-btn--primary v2-btn--sm"
            onClick={() => refresh.mutate()}
            disabled={!status?.enabled || refresh.isPending}
            title={!status?.enabled ? '后端未启用官方采集' : '手动拉取官方快照'}
          >
            {refresh.isPending ? '拉取中…' : '立即拉取'}
          </button>
        </>
      }
    >
      {loading && !status && <div className="v2-sys-inline-muted">官方数据状态加载中…</div>}
      {error && !status && (
        <div className="v2-sys-inline-error">
          官方数据状态加载失败：{error.message}
          <button type="button" className="v2-sys-link" onClick={onRetry}>重试</button>
        </div>
      )}
      {status && (
        <>
          <div className="v2-sys-station-tags">
            {status.stations.map((station) => (
              <span key={`${station.reachId}-${station.stationName}`} title={station.note}>
                {station.reachId} ↔ {station.stationName}
              </span>
            ))}
          </div>
          <div className="v2-sys-official-meta">
            <span className="v2-mono">{status.sourceLabel}</span>
            <span>缓存 {status.cacheMinutes} 分钟 · 过期 {status.staleMinutes} 分钟</span>
          </div>
          {last ? (
            <div className="v2-sys-official-meta">
              <span>最近拉取 <b className="v2-mono">{formatTime(last.fetchedAt)}</b></span>
              <Badge tone={last.ok ? 'live' : 'high'}>{last.ok ? '成功' : '失败'}</Badge>
              <span>{last.stationCount} 站 · 新增 {last.recordCount} 条{last.durationMs !== null ? ` · ${last.durationMs}ms` : ''}</span>
            </div>
          ) : <div className="v2-sys-inline-muted">尚无拉取记录</div>}
          {last?.message && <p className="v2-sys-note">{last.message}</p>}
          <p className="v2-sys-note">
            官方站与逻辑断面为示意关联（待核）；平台只发布当前快照，无历史序列。默认不自动抓取，手动拉取受缓存与节流限制。
          </p>
        </>
      )}
      {refresh.data && <div className={refresh.data.ok ? 'v2-sys-inline-ok' : 'v2-sys-inline-error'}>{summary(refresh.data)}</div>}
      {refresh.isError && <div className="v2-sys-inline-error">拉取请求失败：{(refresh.error as Error).message}</div>}
    </Panel>
  );
}
