import { useState } from 'react';
import type { Diagnostics } from '@/services/apiClient';
import type { HealthResponse, ImportBatch, OfficialAutoStatus } from '@/types/contract';
import { Icon, type IconName } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';

interface SourceRowData {
  id: string;
  icon: IconName;
  type: string;
  typeKey: string;
  name: string;
  category: string;
  note: string;
  updated: string;
  records: string;
  status: 'online' | 'degraded' | 'offline';
  statusText: string;
  simulated?: boolean;
}

export function SourcesPanelV2({
  health, diag, official, batches, streamState, onProbe,
}: {
  health?: HealthResponse;
  diag?: Diagnostics;
  official?: OfficialAutoStatus;
  batches: ImportBatch[];
  streamState: string;
  onProbe: (id: string) => Promise<void>;
}) {
  const [probing, setProbing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const lastBatch = [...batches].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  const lastFetch = official?.lastFetch;

  const rows: SourceRowData[] = [
    {
      id: 'api', icon: 'server', type: '平台接口', typeKey: 'official',
      name: '后端 API', category: '健康检查 · 事件 · 任务 · 复盘',
      note: health ? `版本 ${health.version}` : '状态加载中',
      updated: '—', records: health?.status === 'ok' ? '可用' : '异常',
      status: health?.status === 'ok' ? 'online' : 'offline', statusText: health?.status === 'ok' ? '正常' : '异常',
    },
    {
      id: 'db', icon: 'layers', type: '存储', typeKey: 'device',
      name: '数据库', category: '观测 · 事件 · 证据 · 批次',
      note: health ? `连接 ${health.database}` : '状态加载中',
      updated: '—', records: diag ? diag.counts.observations.toLocaleString() : '—',
      status: health?.database === 'ok' ? 'online' : 'offline', statusText: health?.database === 'ok' ? '正常' : '异常',
    },
    {
      id: 'mqtt', icon: 'twin', type: '模拟引擎', typeKey: 'sim',
      name: 'MQTT 模拟链路', category: '模拟观测 · 场景编排',
      note: diag ? `${diag.mqtt.host}:${diag.mqtt.port} · 陈旧 ${diag.mqtt.staleSeconds}s` : '诊断加载中',
      updated: '—', records: diag ? String(diag.counts.processedMessages) : '—',
      status: diag?.mqtt.enabled ? 'online' : 'offline', statusText: diag?.mqtt.enabled ? '已启用' : '未启用', simulated: true,
    },
    {
      id: 'official', icon: 'wave', type: '官方接口', typeKey: 'official',
      name: '官方自动站', category: 'OFFICIAL_AUTO · 当前快照',
      note: official ? official.sourceLabel : '状态加载中',
      updated: lastFetch ? lastFetch.fetchedAt.slice(5, 16).replace('T', ' ') : '暂无',
      records: lastFetch ? `${lastFetch.stationCount}站·${lastFetch.recordCount}条` : '—',
      status: official?.enabled ? (lastFetch && !lastFetch.ok ? 'degraded' : 'online') : 'offline',
      statusText: official?.enabled ? (lastFetch && !lastFetch.ok ? '拉取失败' : '采集开启') : '采集关闭',
    },
    {
      id: 'monthly', icon: 'download', type: '官方历史', typeKey: 'official',
      name: '官方月报', category: 'OFFICIAL_HISTORY · 按批次导入',
      note: lastBatch ? lastBatch.originalFilename : '暂无导入批次',
      updated: lastBatch?.createdAt ? lastBatch.createdAt.slice(5, 16).replace('T', ' ') : '—',
      records: `${batches.length}批·${lastBatch?.rowCount ?? 0}行`,
      status: batches.length ? 'online' : 'offline', statusText: batches.length ? `${batches.length} 批次` : '无批次',
    },
    {
      id: 'sse', icon: 'assistant', type: '实时通道', typeKey: 'device',
      name: 'SSE 实时通道', category: '事件与状态推送',
      note: '浏览器 EventSource',
      updated: '—', records: streamState === 'open' ? '已连接' : '未连接',
      status: streamState === 'open' ? 'online' : 'offline', statusText: streamState === 'open' ? '已连接' : '未连接',
    },
  ];

  async function probe(row: SourceRowData) {
    setProbing(row.id); setNotice(''); setError('');
    try {
      await onProbe(row.id);
      setNotice(`已刷新 ${row.name} 的真实状态。`);
    } catch (exc) {
      setError(`${row.name} 检测失败：${(exc as Error).message}`);
    } finally {
      setProbing(null);
    }
  }

  const officialCount = rows.filter((row) => row.typeKey === 'official').length;
  const simCount = rows.filter((row) => row.simulated).length;

  return (
    <Panel
      code="03"
      title="数据源"
      en="DATA SOURCES"
      className="sources-panel"
      footer={
        <>
          <span className="sources-panel__foot">
            官方数据 <b className="v2-mono">{String(officialCount).padStart(2, '0')}</b>
            <span className="sources-panel__sep" />
            模拟数据 <b className="v2-mono">{String(simCount).padStart(2, '0')}</b>
            <span className="sources-panel__sep" />
            接入源 <b className="v2-mono">{String(rows.length).padStart(2, '0')}</b>
          </span>
          <span className="sources-panel__foot sources-panel__foot--right v2-mono">
            {streamState === 'open' ? '实时通道在线' : '实时通道未连接'}
          </span>
        </>
      }
    >
      <div className="sources-list">
        {rows.map((row) => (
          <div className={`data-source-row ${row.simulated ? 'is-simulated' : ''}`.trim()} key={row.id}>
            <span className={`data-source-row__icon data-source-row__icon--${row.typeKey}`}>
              <Icon name={row.icon} size={16} />
            </span>
            <div className="data-source-row__main">
              <div className="data-source-row__title">
                <b>{row.name}</b>
                <span className={`source-badge source-badge--${row.typeKey}`}>{row.type}</span>
                {row.simulated && <span className="source-badge source-badge--sim">SIMULATED</span>}
              </div>
              <span className="data-source-row__meta">{row.category} · {row.note}</span>
            </div>
            <div className="data-source-row__stat">
              <span>更新</span><b className="v2-mono" title={row.updated}>{row.updated}</b>
            </div>
            <div className="data-source-row__stat">
              <span title="记录 / 状态">记录</span><b className="v2-mono" title={row.records}>{row.records}</b>
            </div>
            <span className={`source-status source-status--${row.status}`}><i />{row.statusText}</span>
            <button type="button" className="source-test" onClick={() => void probe(row)} disabled={probing === row.id}>
              {probing === row.id ? <><Icon name="refresh" size={11} className="v2-is-spinning" />检测中</> : '检测'}
            </button>
          </div>
        ))}
      </div>
      {notice && <div className="v2-sys-inline-ok">{notice}</div>}
      {error && <div className="v2-sys-inline-error">{error}</div>}
      <p className="v2-sys-note">检测仅调用对应真实查询刷新状态，不修改数据；延迟字段后端未提供时显示“—”。</p>
    </Panel>
  );
}
