import { useState } from 'react';
import type { IngestionErrorItem } from '@/services/apiClient';
import { formatTime } from '@/components/EventBits';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { Segmented } from '../../components/ui/Segmented';

const REASON_TEXT: Record<string, string> = {
  INVALID_JSON: '非法 JSON',
  SCHEMA_VIOLATION: '契约校验失败',
  TOPIC_MISMATCH: 'Topic 与断面不符',
  UNKNOWN_REACH: '未知监测点',
  UNKNOWN_METRIC: '未知指标',
  UNIT_MISMATCH: '单位不一致',
  OUT_OF_RANGE: '超出量程',
};

type LogFilter = 'all' | 'info' | 'warn' | 'error';

export function LogsPanelV2({
  errors, total, loading, error, onReload,
}: {
  errors: IngestionErrorItem[];
  total: number;
  loading: boolean;
  error?: Error | null;
  onReload: () => void;
}) {
  const [filter, setFilter] = useState<LogFilter>('all');

  function exportLogs() {
    const lines = [
      '# TideWatch 运行日志 · ingestion_errors',
      `# 导出时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      `# 共 ${errors.length} 条（接口 total ${total}）`,
      '',
      ...errors.map((item) =>
        `${item.receivedAt ?? '—'} [ERROR] [${item.source}] ${REASON_TEXT[item.reason] ?? item.reason} · topic=${item.topic ?? '—'} · ${item.detail ?? ''}`,
      ),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TideWatch-ingestion-errors.log';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const filtered = filter === 'all' || filter === 'error' ? errors : [];

  return (
    <Panel
      code="05"
      title="运行日志"
      en="SYSTEM LOGS"
      className="logs-panel"
      actions={
        <>
          <Segmented
            ariaLabel="按日志级别筛选"
            mini
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '全部' },
              { value: 'info', label: '信息' },
              { value: 'warn', label: '警告' },
              { value: 'error', label: '错误' },
            ]}
          />
          <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={exportLogs} disabled={errors.length === 0}>
            <Icon name="download" size={12} />导出日志
          </button>
        </>
      }
      footer={
        <>
          <span className="logs-panel__foot">
            共 <b className="v2-mono">{errors.length}</b> 条 · 来源 ingestion_errors
            {total > errors.length && ` · 接口 total ${total}`}
          </span>
          <span className="logs-panel__foot logs-panel__foot--right v2-mono">
            REAL ERROR LOG
          </span>
        </>
      }
    >
      {loading && errors.length === 0 && <div className="v2-sys-inline-muted">日志加载中…</div>}
      {error && errors.length === 0 && (
        <div className="v2-sys-inline-error">
          日志加载失败：{error.message}
          <button type="button" className="v2-sys-link" onClick={onReload}>重试</button>
        </div>
      )}
      <div className="log-console">
        {filtered.map((item) => (
          <div className="log-line log-line--error" key={item.errorId}>
            <span className="log-line__time v2-mono">{item.receivedAt ? formatTime(item.receivedAt) : '—'}</span>
            <span className="log-line__level log-line__level--error">ERROR</span>
            <span className="log-line__source v2-mono">[{item.source}]</span>
            <span className="log-line__message">
              {REASON_TEXT[item.reason] ?? item.reason} · {item.topic ?? '—'} · {item.detail ?? '—'}
            </span>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="log-empty"><Icon name="review" size={18} />当前级别暂无日志</div>
        )}
      </div>
      <p className="v2-sys-note">
        当前仅后端提供 ingestion_errors 真实错误日志；info/warn 级别无真实数据源，因此不展示伪造日志。
      </p>
    </Panel>
  );
}
