import { Fragment } from 'react';
import type { Diagnostics } from '@/services/apiClient';
import type { HealthResponse, ImportBatch, OfficialAutoStatus } from '@/types/contract';
import { Icon, type IconName } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';

interface Node {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  meta: string;
  status: string;
  tone: 'ok' | 'warn' | 'idle' | 'bad';
}

export function DataPipelinePanel({
  health, diag, official, batches, eventsTotal, streamState,
}: {
  health?: HealthResponse;
  diag?: Diagnostics;
  official?: OfficialAutoStatus;
  batches: ImportBatch[];
  eventsTotal: number;
  streamState: string;
}) {
  const errors = diag?.counts.ingestionErrors ?? 0;
  const observations = diag?.counts.observations;
  const processed = diag?.counts.processedMessages;
  const duplicates = diag?.counts.duplicateMessages;
  const nodes: Node[] = [
    {
      key: 'sources', icon: 'system', title: '数据源',
      sub: `${official?.enabled ? '官方自动 01' : '官方自动 关闭'} · MQTT 模拟 · 月报 ${batches.length}`,
      meta: observations !== undefined ? `${observations.toLocaleString()} 条观测` : '观测统计加载中',
      status: health?.status === 'ok' ? '在线' : '检查中',
      tone: health?.status === 'ok' ? 'ok' : 'warn',
    },
    {
      key: 'gateway', icon: 'filter', title: '接入网关',
      sub: '契约校验 · 去重 · 死信',
      meta: `重复 ${duplicates?.toLocaleString() ?? '—'} · 坏消息 ${errors}`,
      status: errors > 0 ? '存在坏消息' : '正常',
      tone: errors > 0 ? 'warn' : 'ok',
    },
    {
      key: 'service', icon: 'server', title: '数据服务',
      sub: '清洗 · 聚合 · 研判',
      meta: processed !== undefined ? `${processed.toLocaleString()} 已处理` : '处理统计加载中',
      status: health?.status === 'ok' ? '在线' : '异常',
      tone: health?.status === 'ok' ? 'ok' : 'bad',
    },
    {
      key: 'app', icon: 'overview', title: '应用层',
      sub: '总览 · 研判 · 巡检 · 复盘',
      meta: `事件 ${eventsTotal} 起`,
      status: streamState === 'open' ? '实时推送' : '接口可用',
      tone: streamState === 'open' ? 'ok' : 'idle',
    },
  ];

  return (
    <Panel
      code="01"
      title="数据链路"
      en="DATA PIPELINE"
      className="pipeline-system-panel"
      footer={
        <>
          <span className="pipeline-system__foot">
            <span className={`v2-status-dot ${streamState === 'open' ? '' : 'v2-status-dot--idle'}`} style={{ width: 5, height: 5 }} />
            观测 <b className="v2-mono">{observations?.toLocaleString() ?? '—'}</b>
          </span>
          <span className="pipeline-system__foot">
            坏消息 <b className="v2-mono">{errors}</b>
          </span>
          <span className="pipeline-system__foot pipeline-system__foot--right v2-mono">
            真实接口 · {health?.version ?? '—'}
          </span>
        </>
      }
    >
      <div className="pipeline-chain">
        {nodes.map((node, index) => (
          <Fragment key={node.key}>
            <div className="chain-node">
              <span className="chain-node__icon"><Icon name={node.icon} size={18} /></span>
              <div className="chain-node__main">
                <b>{node.title}</b>
                <span>{node.sub}</span>
              </div>
              <div className="chain-node__foot">
                <span className={`chain-node__status chain-node__status--${node.tone}`}>
                  <i />{node.status}
                </span>
                <span className="chain-node__meta v2-mono">{node.meta}</span>
              </div>
            </div>
            {index < nodes.length - 1 && (
              <span className="chain-link" aria-hidden="true"><i /><i /><i /></span>
            )}
          </Fragment>
        ))}
      </div>
    </Panel>
  );
}
