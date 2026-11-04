import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useStreamState } from '@/store/stream';
import { useDemoStore } from '../../demo/demoStore';
import { useDemoOverviewData } from '../../demo/useDemoOverviewData';
import type { StationId, OverviewData } from '../../types';
import { buildOverviewData, STATION_MAP } from './overviewAdapter';
import { Icon } from '../../components/ui/Icon';
import { PanelState } from '../../components/ui/PanelState';
import { AlertRail } from './AlertRail';
import { InspectionBoard } from './InspectionBoard';
import { MetricStrip } from './MetricStrip';
import { PipelinePanel } from './PipelinePanel';
import { RecentEvents } from './RecentEvents';
import { RiverStage } from './RiverStage';
import { SystemPulse } from './SystemPulse';
import { TrendPanel } from './TrendPanel';
import { OverviewSkeleton } from './OverviewSkeleton';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/overview.css';
import '../../styles/overview-v2.css';
import '../../styles/pages.css';

const TREND_PAGE_SIZE = 96;
const SPARK_POINTS = 24;

/** 首页真实数据聚合：全部走主项目 apiClient，SSE 状态来自全局 stream store。 */
export function useOverviewData() {
  const streamState = useStreamState();
  const reachesQ = useQuery({ queryKey: ['reaches'], queryFn: api.reaches, refetchInterval: 15000 });
  const activeEventsQ = useQuery({
    queryKey: ['events', 'ACTIVE', 50],
    queryFn: () => api.events({ status: 'ACTIVE', pageSize: 50 }),
    refetchInterval: 8000,
  });
  const recentEventsQ = useQuery({
    queryKey: ['events', 'recent', 5],
    queryFn: () => api.events({ pageSize: 5 }),
    refetchInterval: 15000,
  });
  const tasksQ = useQuery({
    queryKey: ['tasks', 'board', 12],
    queryFn: () => api.tasks({ pageSize: 12 }),
    refetchInterval: 8000,
  });
  const taskTotalsQ = useQuery({
    queryKey: ['tasks', 'totals'],
    queryFn: async () => {
      const statuses = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED'] as const;
      const totals: Record<string, number> = {};
      await Promise.all(
        statuses.map(async (s) => {
          const res = await api.tasks({ status: s, pageSize: 1 });
          totals[s] = res.total;
        }),
      );
      return totals;
    },
    refetchInterval: 15000,
  });
  const freqQ = useQuery({
    queryKey: ['event-frequency'],
    queryFn: api.eventFrequency,
    refetchInterval: 30000,
  });
  const healthQ = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 10000 });
  const diagQ = useQuery({ queryKey: ['diagnostics'], queryFn: api.diagnostics, refetchInterval: 30000 });
  const scenarioQ = useQuery({ queryKey: ['scenario-status'], queryFn: api.scenarioStatus, refetchInterval: 3000 });
  const officialQ = useQuery({ queryKey: ['official-auto'], queryFn: () => api.officialAuto(), refetchInterval: 60000 });

  const reachIds = Object.values(STATION_MAP);
  const latestQueries = useQuery({
    queryKey: ['latest', 'all'],
    queryFn: async () => {
      const entries = await Promise.all(reachIds.map((rid) => api.latest(rid)));
      return Object.fromEntries(reachIds.map((rid, i) => [rid, entries[i]]));
    },
    refetchInterval: 8000,
  });
  const obsQueries = useQuery({
    queryKey: ['obs', 'spark-and-trend', TREND_PAGE_SIZE],
    queryFn: async () => {
      const entries = await Promise.all(
        reachIds.map(async (rid) => {
          // 最新观测：desc 取最近 TREND_PAGE_SIZE 条，再按时间正序排列供图表使用
          const [turb, level] = await Promise.all([
            api.observations(rid, { metric: 'turbidity', order: 'desc', pageSize: TREND_PAGE_SIZE }),
            api.observations(rid, { metric: 'waterLevel', order: 'desc', pageSize: SPARK_POINTS }),
          ]);
          return [rid, { turbidity: [...turb.items].reverse(), waterLevel: [...level.items].reverse() }] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    refetchInterval: 8000,
  });

  const reaches = reachesQ.data ?? [];
  const activeItems = activeEventsQ.data?.items ?? [];
  const recentItems = recentEventsQ.data?.items ?? [];
  const tasks = tasksQ.data?.items ?? [];
  const latestByReach = latestQueries.data ?? {};
  const obsByReach = obsQueries.data ?? {};

  const sparkByReach: Record<string, Record<string, number[]>> = {};
  const trend24h: Record<string, { labels: string[]; values: number[]; timestamps: string[] }> = {};
  const trend7d: Record<string, { labels: string[]; values: number[]; timestamps: string[] }> = {};
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const rid of reachIds) {
    const { turbidity = [], waterLevel = [] } = obsByReach[rid] ?? {};
    const goodTurb = turbidity.filter((o) => o.qualityFlag === 'GOOD' && !Number.isNaN(o.value));
    const goodLevel = waterLevel.filter((o) => o.qualityFlag === 'GOOD' && !Number.isNaN(o.value));
    sparkByReach[rid] = {
      turbidity: goodTurb.slice(-SPARK_POINTS).map((o) => o.value),
      waterLevel: goodLevel.slice(-SPARK_POINTS).map((o) => o.value),
    };
    const day = goodTurb.filter((o) => new Date(o.observedAt).getTime() >= dayAgo);
    trend24h[rid] = {
      labels: day.map((o) => o.observedAt.slice(11, 16)),
      values: day.map((o) => o.value),
      timestamps: day.map((o) => o.observedAt),
    };
    trend7d[rid] = {
      labels: goodTurb.map((o) => o.observedAt.slice(5, 16).replace('T', ' ')),
      values: goodTurb.map((o) => o.value),
      timestamps: goodTurb.map((o) => o.observedAt),
    };
  }
  const leadEventFirstSeenAt = activeItems
    .slice()
    .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))[0]?.firstSeenAt ?? null;

  const data: OverviewData | null =
    reaches.length > 0 && activeEventsQ.data && tasksQ.data
      ? buildOverviewData({
          reaches,
          latestByReach,
          sparkByReach,
          activeEvents: activeItems,
          recentEvents: recentItems,
          tasks,
          taskTotalByStatus: taskTotalsQ.data ?? {},
          eventFrequency: freqQ.data ?? { totalEvents: 0, byStatus: {}, byType: {}, eventsPerReach: {} },
          health: healthQ.data ?? { status: 'degraded', version: '—', database: 'error' },
          mqtt: (diagQ.data as { mqtt?: { enabled: boolean; connected: boolean; host?: string | null } } | undefined)?.mqtt ?? null,
          scenario: scenarioQ.data ?? { running: false, scenario: null },
          streamState,
          officialWaterClass: Object.fromEntries(
            (officialQ.data ?? [])
              .filter((r) => r.reachId)
              .map((r) => [r.reachId, r.records[0]?.waterClass ?? null] as [string, string | null]),
          ),
          officialByReach: Object.fromEntries(
            (officialQ.data ?? [])
              .filter((r) => r.reachId && r.records.length > 0)
              .map((r) => [r.reachId, r.records[0]]),
          ),
          trend24h,
          trend7d,
          leadEventFirstSeenAt,
        })
      : null;

  const loading = reachesQ.isLoading || activeEventsQ.isLoading || tasksQ.isLoading;
  const error = [reachesQ, activeEventsQ, tasksQ, healthQ].map((q) => q.error).find(Boolean);

  return { data, loading, error };
}

export default function OverviewV2Page() {
  const queryClient = useQueryClient();
  const { data: realData, loading, error } = useOverviewData();
  const demoEnabled = useDemoStore((s) => s.enabled);
  const demoPlayback = useDemoStore((s) => s.playback);
  const demoSpeed = useDemoStore((s) => s.speed);
  const demo = useDemoOverviewData();
  const [selected, setSelected] = useState<StationId>('B');
  const [refreshing, setRefreshing] = useState(false);

  // 离开首页（或刷新）即退出演示模式：清理内存状态与计时器，回到真实模式
  useEffect(() => () => useDemoStore.getState().disable(), []);

  const data = demoEnabled ? demo.data : realData;

  const reload = async () => {
    if (demoEnabled) return;
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  };

  if (!demoEnabled && loading && !data) return <OverviewSkeleton />;

  if (!demoEnabled && (error || !data)) {
    return (
      <div className="v2-scope">
        <div className="v2-page">
          <div className="v2-panel v2-state-page">
            <PanelState
              variant="error"
              title="监测数据暂时不可用"
              desc={(error as Error | undefined)?.message ?? '无法连接数据源，请检查后端连接状态后重试。'}
              action={
                <button type="button" className="v2-btn" onClick={() => void reload()}>
                  <Icon name="refresh" size={13} />
                  重新加载
                </button>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <OverviewSkeleton />;

  const lead = data.alerts.find((a) => a.risk === 'high') ?? data.alerts[0];
  const leadStation = lead ? data.stations.find((s) => s.id === lead.stationId) : undefined;
  const riskLabel = lead ? (lead.risk === 'high' ? '高风险' : lead.risk === 'medium' ? '中风险' : '低风险') : '无预警';
  const running = data.summary.taskRunning;
  const pendingReview = data.summary.taskPendingReview;

  const turbidity = Object.fromEntries(
    data.stations.map((s) => [s.id, data.metrics[s.id].find((m) => m.key === 'turbidity')?.value]),
  ) as Record<StationId, number | null>;

  const level = data.metrics.B.find((m) => m.key === 'level')?.value ?? null;

  const stationName = (id: StationId) =>
    data.stations.find((s) => s.id === id)?.name.replace(' 断面', '') ?? id;
  const observedLabel = demoEnabled
    ? data.updatedAt
    : data.summary.latestObservedAt
      ? data.summary.latestObservedAt.slice(5, 16).replace('T', ' ')
      : '—';
  const realtimeOnline = data.system.sources.find((s) => s.type === 'realtime')?.online ?? false;
  const isLive = !demoEnabled && realtimeOnline && data.summary.reachesOnline > 0;

  return (
    <div className="v2-scope">
      <div className="v2-page v2-overview-page">
        {demoEnabled && (
          <div className="v2-demo-banner" role="alert">
            <span className="v2-demo-banner__flag">场景演示 · 模拟数据</span>
            <span className="v2-demo-banner__phase">
              当前阶段：{demo.phase.label} · 演示时间 {demo.data.updatedAt}
            </span>
            <div className="v2-demo-banner__controls">
              {demoPlayback === 'playing' ? (
                <button type="button" className="v2-demo-ctl" onClick={() => useDemoStore.getState().pause()}>
                  <Icon name="wave" size={11} /> 暂停
                </button>
              ) : (
                <button type="button" className="v2-demo-ctl" onClick={() => useDemoStore.getState().resume()}>
                  <Icon name="wave" size={11} /> 继续
                </button>
              )}
              <button type="button" className="v2-demo-ctl" onClick={() => useDemoStore.getState().replay()}>
                <Icon name="refresh" size={11} /> 重新播放
              </button>
              <button
                type="button"
                className="v2-demo-ctl"
                onClick={() => useDemoStore.getState().setSpeed(demoSpeed === 1 ? 4 : 1)}
              >
                {demoSpeed}×
              </button>
              <button type="button" className="v2-demo-ctl v2-demo-ctl--exit" onClick={() => useDemoStore.getState().disable()}>
                退出演示
              </button>
            </div>
          </div>
        )}
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>
                {demoEnabled ? 'SCENARIO DEMO · SIMULATED · 内存回放' : `${isLive ? 'LIVE SITUATION' : 'HISTORICAL SNAPSHOT'} · ${observedLabel} · ${data.scenario}`}
              </span>
              {demoEnabled ? (
                <span className="v2-intro-sync v2-mono">演示模式 · 数据不落库</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="v2-intro-sync"
                    onClick={() => useDemoStore.getState().enable()}
                  >
                    <Icon name="wave" size={11} />
                    场景演示
                  </button>
                  <button
                    type="button"
                    className="v2-intro-sync"
                    onClick={() => void reload()}
                    disabled={refreshing}
                  >
                    <Icon name="refresh" size={11} className={refreshing ? 'v2-is-spinning' : undefined} />
                    {refreshing ? '同步中' : '刷新'}
                  </button>
                </>
              )}
            </div>
            <h1 className="v2-page-title">
              河流态势总览
              <em>RIVER OVERVIEW</em>
            </h1>
            <p className="v2-page-situation">
              物理站点 <b>{data.summary.reachesOnline}/{data.summary.stationCount}</b> 在线，实时通道 <b>{realtimeOnline ? '已连接' : '未连接'}</b>，最新观测 <b className="v2-mono">{observedLabel}</b>。
              {!isLive && <> 当前展示<b>历史观测快照</b>，不代表站点实时在线。</>}
              {lead && leadStation ? (
                <>
                  {' '}{leadStation.name}
                  <b className="v2-hot">{lead.title.split('·')[1]?.trim() ?? lead.title}</b>
                  ，{lead.status}。
                </>
              ) : (
                <> 暂无活跃异常事件。</>
              )}
              {' '}活动预警 {data.summary.activeEventCount} 起，{running} 项巡检任务执行中。
            </p>
          </div>

          <div className="v2-readouts">
            <div className="v2-readout v2-readout--primary v2-readout--risk">
              <span className="v2-readout__label">CURRENT RISK</span>
              <div className="v2-readout__value">
                {lead?.riskCode ?? 'R0'}
                <small>{riskLabel}</small>
              </div>
              <div className="v2-readout__sub">
                <span className="v2-status-dot v2-status-dot--danger" style={{ width: 5, height: 5 }} />
                {lead && leadStation
                  ? `${leadStation.name.replace(' 断面', '')} · ${lead.title.split('·')[1]?.trim() ?? lead.title}`
                  : '暂无活跃风险'}
              </div>
            </div>
            <div className="v2-readout v2-readout--secondary">
              <span className="v2-readout__label">STATIONS</span>
              <div className="v2-readout__value">
                {String(data.summary.reachesOnline).padStart(2, '0')}
                <small>/ {String(data.summary.stationCount).padStart(2, '0')} 在线</small>
              </div>
              <div className="v2-readout__sub">最新观测 <span className="v2-mono">{observedLabel}</span></div>
            </div>
            <div className="v2-readout v2-readout--secondary">
              <span className="v2-readout__label">FIELD TASKS</span>
              <div className="v2-readout__value">
                {String(data.summary.taskPendingReview + data.summary.taskRunning).padStart(2, '0')}
                <small>项未闭环</small>
              </div>
              <div className="v2-readout__sub">
                {running} 执行中 · {pendingReview} 待复核 · 已完成 {data.summary.taskCompleted}
              </div>
            </div>
          </div>
        </div>

        <div className="v2-grid v2-stagger v2-overview-grid">
          <div className="v2-col-8">
            <RiverStage
              stations={data.stations}
              selected={selected}
              onSelect={setSelected}
              turbidity={turbidity}
              level={level}
              syncedAt={observedLabel}
            />
          </div>
          <div className="v2-col-4">
            <AlertRail alerts={data.alerts} demo={demoEnabled} />
          </div>

          <div className="v2-col-12">
            <MetricStrip
              stations={data.stations}
              metrics={data.metrics}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          <div className="v2-col-8">
            <TrendPanel
              trend={data.trend}
              eventId={lead?.id}
              leadReachName={leadStation?.name.replace(' 断面', '')}
              demoOnly24h={demoEnabled}
            />
          </div>
          <div className="v2-col-4">
            <PipelinePanel stages={data.pipeline} />
          </div>

          <div className="v2-col-5">
            <InspectionBoard tasks={data.inspections} stations={data.stations} completedCount={data.summary.taskCompleted} demo={demoEnabled} />
          </div>
          <div className="v2-col-4">
            <RecentEvents incidents={data.incidents} stationName={stationName} demo={demoEnabled} />
          </div>
          <div className="v2-col-3">
            <SystemPulse system={data.system} />
          </div>
        </div>
      </div>
    </div>
  );
}
