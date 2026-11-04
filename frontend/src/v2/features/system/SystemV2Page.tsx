import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import type { Diagnostics } from '@/services/apiClient';
import { useStreamState } from '@/store/stream';
import type { HealthResponse, ImportBatch, OfficialAutoStatus } from '@/types/contract';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/system.css';
import '../../styles/system-v2.css';
import { DataPipelinePanel } from './DataPipelinePanel';
import { SystemHealthPanel } from './SystemHealthPanel';
import { SourcesPanelV2 } from './SourcesPanelV2';
import { ScenarioPanelV2 } from './ScenarioPanelV2';
import { LogsPanelV2 } from './LogsPanelV2';
import { OfficialAutoPanel } from './OfficialAutoPanel';
import { MonthlyImportV2Panel } from './MonthlyImportV2Panel';
import { HelpV2Panel } from './HelpV2Panel';
import type { ScenarioStatus } from './scenarioTypes';

/**
 * F7.2 数据与系统管理：恢复 TidewatchWeb System 原版视觉结构，
 * 数据全部来自真实 health/diagnostics/import/official/scenario 接口。
 */
export default function SystemV2Page() {
  const streamState = useStreamState();
  const [syncing, setSyncing] = useState(false);
  const healthQ = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 10000 });
  const diagQ = useQuery({ queryKey: ['diagnostics'], queryFn: api.diagnostics, refetchInterval: 10000 });
  const batchesQ = useQuery({ queryKey: ['import-batches'], queryFn: api.importBatches, refetchInterval: 30000 });
  const officialQ = useQuery({ queryKey: ['official-auto-status'], queryFn: api.officialAutoStatus, refetchInterval: 30000 });
  const scenarioQ = useQuery({ queryKey: ['scenario-status'], queryFn: api.scenarioStatus, refetchInterval: 5000 });
  const eventsQ = useQuery({ queryKey: ['system-events-total'], queryFn: () => api.events({ page: 1, pageSize: 1 }), refetchInterval: 15000 });
  const errorsQ = useQuery({ queryKey: ['system-ingestion-errors'], queryFn: () => api.ingestionErrors({ page: 1, pageSize: 50 }), refetchInterval: 15000 });

  const health = healthQ.data as HealthResponse | undefined;
  const diag = diagQ.data as Diagnostics | undefined;
  const batches = (batchesQ.data ?? []) as ImportBatch[];
  const official = officialQ.data as OfficialAutoStatus | undefined;
  const scenario = scenarioQ.data as ScenarioStatus | undefined;
  const eventsTotal = eventsQ.data?.total ?? 0;
  const errors = errorsQ.data?.items ?? [];
  const errorsTotal = errorsQ.data?.total ?? 0;

  const stationTotal = diag
    ? diag.counts.reachesOnline + diag.counts.reachesStale + diag.counts.reachesOffline
    : 0;
  const serviceText = health
    ? health.status === 'ok' && health.database === 'ok' ? '正常' : '降级'
    : healthQ.isError ? '不可达' : '检测中';
  const scenarioText = scenario?.running ? scenario.scenario ?? '运行中' : '空闲';
  const deadLetters = diag?.counts.ingestionErrors;

  const reloadAll = async () => {
    setSyncing(true);
    try {
      await Promise.allSettled([
        healthQ.refetch(), diagQ.refetch(), batchesQ.refetch(),
        officialQ.refetch(), scenarioQ.refetch(), eventsQ.refetch(), errorsQ.refetch(),
      ]);
    } finally {
      setSyncing(false);
    }
  };

  async function probeSource(id: string) {
    if (id === 'api' || id === 'db') await Promise.all([healthQ.refetch(), diagQ.refetch()]);
    else if (id === 'mqtt') await diagQ.refetch();
    else if (id === 'official') await officialQ.refetch();
    else if (id === 'monthly') await batchesQ.refetch();
    else await Promise.resolve();
  }

  return (
    <div className="v2-scope">
      <div className="v2-page v2-sys-page">
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>SYSTEM · OPERATIONS CONSOLE</span>
              <button type="button" className="v2-sys-sync" onClick={() => void reloadAll()} disabled={syncing}>
                <Icon name="refresh" size={11} className={syncing ? 'v2-is-spinning' : undefined} />
                {syncing ? '同步中' : '刷新'}
              </button>
            </div>
            <h1 className="v2-page-title">数据与系统管理<em>SYSTEM</em></h1>
            <p className="v2-page-situation">
              后端服务 <b>{serviceText}</b>
              {diag ? ` · 断面 ${diag.counts.reachesOnline}/${stationTotal} 在线` : ''}
              {' · '}场景 <b>{scenarioText}</b>
              {typeof deadLetters === 'number' ? ` · 坏消息 ${deadLetters} 条` : ''}
              。数据链路、数据源与场景均来自真实接口，写操作需二次确认。
            </p>
          </div>
          <div className="v2-readouts">
            <div className="v2-readout">
              <span className="v2-readout__label">SERVICE</span>
              <div className={`v2-readout__value v2-readout__value--text ${serviceText === '正常' ? 'is-ok' : serviceText === '不可达' ? 'is-bad' : ''}`.trim()}>{serviceText}</div>
              <div className="v2-readout__sub">{health ? `v${health.version}` : '健康检查'}</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">STATIONS</span>
              <div className="v2-readout__value">{diag ? diag.counts.reachesOnline : '—'}<small>/ {diag ? stationTotal : '—'}</small></div>
              <div className="v2-readout__sub">在线断面</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">SCENARIO</span>
              <div className={`v2-readout__value v2-readout__value--text ${scenario?.running ? 'is-bad' : ''}`.trim()}>{scenarioText}</div>
              <div className="v2-readout__sub"><Badge tone="demo">SIMULATED</Badge></div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">DEAD LETTERS</span>
              <div className={`v2-readout__value ${deadLetters ? 'is-bad' : ''}`.trim()}>{typeof deadLetters === 'number' ? deadLetters : '—'}</div>
              <div className="v2-readout__sub">ingestion_errors</div>
            </div>
          </div>
        </div>

        <div className="v2-grid v2-sys-grid">
          <div className="v2-col-8">
            <DataPipelinePanel
              health={health} diag={diag} official={official} batches={batches}
              eventsTotal={eventsTotal} streamState={streamState}
            />
          </div>
          <div className="v2-col-4">
            <SystemHealthPanel
              health={health} healthError={healthQ.error as Error | null}
              eventsOk={eventsQ.isSuccess} importOk={batchesQ.isSuccess}
              streamState={streamState}
            />
          </div>
          <div className="v2-col-7">
            <SourcesPanelV2
              health={health} diag={diag} official={official} batches={batches}
              streamState={streamState} onProbe={probeSource}
            />
          </div>
          <div className="v2-col-5">
            <ScenarioPanelV2
              status={scenario} error={scenarioQ.error as Error | null}
              loading={scenarioQ.isLoading} onRefresh={() => void scenarioQ.refetch()}
            />
          </div>
          <div className="v2-col-12">
            <LogsPanelV2
              errors={errors} total={errorsTotal} loading={errorsQ.isLoading}
              error={errorsQ.error as Error | null} onReload={() => void errorsQ.refetch()}
            />
          </div>
          <div className="v2-col-5">
            <OfficialAutoPanel
              status={official} error={officialQ.error as Error | null}
              loading={officialQ.isLoading} onRetry={() => void officialQ.refetch()}
            />
          </div>
          <div className="v2-col-7">
            <HelpV2Panel health={health} diag={diag} official={official} />
          </div>
          <div className="v2-col-12">
            <MonthlyImportV2Panel
              batches={batches} loading={batchesQ.isLoading}
              error={batchesQ.error as Error | null} onReload={() => void batchesQ.refetch()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
