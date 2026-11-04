import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useDemoStore } from '../../demo/demoStore';
import { useDemoOverviewData } from '../../demo/useDemoOverviewData';
import { useOverviewData } from '../overview/OverviewV2Page';
import { STATION_MAP } from '../overview/overviewAdapter';
import { buildAnalysisData, type TrendSeriesInput } from './analysisAdapter';
import type { AnalysisMetricKey, AnalysisRange, AnalysisData } from './analysisTypes';
import type { ActiveEvent, Observation, OfficialAutoRecord } from '@/types/contract';
import { summarizeObservationSource } from '@/lib/observationSource';
import { Icon } from '../../components/ui/Icon';
import { PanelState } from '../../components/ui/PanelState';
import { MetricIndex } from './MetricIndex';
import { AnalysisTrendPanel } from './AnalysisTrendPanel';
import { StationCompare } from './StationCompare';
import { MetricMatrix } from './MetricMatrix';
import { WaterQualityPanel } from './WaterQualityPanel';
import { AnalysisSkeleton } from './AnalysisSkeleton';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/analysis.css';

const TREND_PAGE = 1200;

/** 演示模式：从剧本 24h 序列构建五项指标趋势（内存回放，不落库） */
function buildDemoTrends(data: import('../../types').OverviewData): Record<string, Record<AnalysisRange, TrendSeriesInput>> {
  const labels = data.trend['24h'].labels;
  const metrics = ['level', 'turbidity', 'ph', 'oxygen', 'ammonia'] as const;
  const out: Record<string, Record<AnalysisRange, TrendSeriesInput>> = {};
  for (const key of metrics) {
    const perReach: Record<string, number[]> = {};
    for (const id of ['A', 'B', 'C'] as const) {
      const readout = data.metrics[id].find((m) => m.key === key);
      perReach[STATION_MAP[id]] = readout?.spark.length ? readout.spark : [];
    }
    out[key] = {
      '24h': { labels, perReach },
      '7d': { labels: [], perReach: {} },
    };
  }
  return out;
}

/** 分析页真实序列：turbidity / waterLevel 两个 MQTT 指标有连续观测，其余官方日频指标无连续序列（空态展示）。 */
function useAnalysisReal() {
  const overview = useOverviewData();
  const officialQ = useQuery({ queryKey: ['official-auto'], queryFn: () => api.officialAuto(), refetchInterval: 60000 });
  const eventsQ = useQuery({
    queryKey: ['events', 'ACTIVE', 50],
    queryFn: () => api.events({ status: 'ACTIVE', pageSize: 50 }),
    refetchInterval: 8000,
  });
  const reachIds = Object.values(STATION_MAP);
  const trendQ = useQuery({
    queryKey: ['obs', 'analysis-trends', TREND_PAGE],
    queryFn: async () => {
      const entries = await Promise.all(
        reachIds.map(async (rid) => {
          const [turb, level] = await Promise.all([
            api.observations(rid, { metric: 'turbidity', order: 'desc', pageSize: TREND_PAGE }),
            api.observations(rid, { metric: 'waterLevel', order: 'desc', pageSize: TREND_PAGE }),
          ]);
          return [rid, { turbidity: [...turb.items].reverse(), waterLevel: [...level.items].reverse() }] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    refetchInterval: 8000,
  });

  const trends = useMemo(() => {
    const goodOf = (items: Observation[]) =>
      items.filter((o) => o.qualityFlag === 'GOOD' && Number.isFinite(o.value));
    const raw = trendQ.data as Record<string, Record<string, Observation[]>> | undefined;
    const allGood = reachIds.flatMap((rid) =>
      Object.values(raw?.[rid] ?? {}).flatMap((items) => goodOf(items)),
    );
    // 演示/归档数据可能不是“当前时刻”：24h/7d 均以最新观测为锚点，避免历史数据被误判为空。
    const latestMs = allGood.length
      ? Math.max(...allGood.map((o) => new Date(o.observedAt).getTime()))
      : Date.now();
    const dayStart = latestMs - 24 * 3600 * 1000;
    const weekStart = latestMs - 7 * 24 * 3600 * 1000;
    const perMetric: Record<string, Record<AnalysisRange, TrendSeriesInput>> = {};
    // trends 键名必须与分析指标 key 一致（adapter 按 def.key 取值）：
    // 查询 API 用 'waterLevel'，序列挂到 'level' 键。
    for (const [analysisKey, apiMetric] of [['turbidity', 'turbidity'], ['level', 'waterLevel']] as const) {
      perMetric[analysisKey] = { '24h': { labels: [], perReach: {} }, '7d': { labels: [], perReach: {} } };
      for (const rid of reachIds) {
        const items = goodOf(raw?.[rid]?.[apiMetric] ?? []);
        const day = items.filter((o) => new Date(o.observedAt).getTime() >= dayStart);
        const week = items.filter((o) => new Date(o.observedAt).getTime() >= weekStart);
        perMetric[analysisKey]['24h'].labels = perMetric[analysisKey]['24h'].labels.length ? perMetric[analysisKey]['24h'].labels : day.map((o) => o.observedAt.slice(11, 16));
        perMetric[analysisKey]['7d'].labels = perMetric[analysisKey]['7d'].labels.length ? perMetric[analysisKey]['7d'].labels : week.map((o) => o.observedAt.slice(5, 16).replace('T', ' '));
        perMetric[analysisKey]['24h'].perReach[rid] = day.map((o) => o.value);
        perMetric[analysisKey]['7d'].perReach[rid] = week.map((o) => o.value);
      }
    }
    return perMetric;
  }, [trendQ.data, reachIds]);

  const trendSources = useMemo(() => {
    const raw = trendQ.data as Record<string, Record<string, Observation[]>> | undefined;
    const sourceOf = (apiMetric: string) =>
      summarizeObservationSource(reachIds.flatMap((rid) => raw?.[rid]?.[apiMetric] ?? []));
    return {
      turbidity: sourceOf('turbidity'),
      level: sourceOf('waterLevel'),
    };
  }, [trendQ.data, reachIds]);

  const data: AnalysisData | null =
    overview.data
      ? buildAnalysisData({
          overview: overview.data,
          officialByReach: Object.fromEntries(
            (officialQ.data ?? []).filter((r) => r.reachId && r.records.length > 0).map((r) => [r.reachId, r.records[0] as OfficialAutoRecord]),
          ),
          activeEvents: (eventsQ.data?.items ?? []) as ActiveEvent[],
          trends,
          trendSources,
        })
      : null;

  return { data, loading: overview.loading && !data, error: overview.error };
}

/** 演示模式数据（复用 demoScenario；官方三指标在演示下沿用剧本的 ph/oxygen/ammonia，codmn/tp/tn 为空态） */
function useAnalysisDemo() {
  const demo = useDemoOverviewData();
  const data = useMemo(
    () =>
      buildAnalysisData({
        overview: demo.data,
        officialByReach: {},
        activeEvents: [],
        trends: buildDemoTrends(demo.data),
        trendSources: {
          turbidity: summarizeObservationSource([{ sourceType: 'SIMULATED' }]),
          level: summarizeObservationSource([{ sourceType: 'SIMULATED' }]),
        },
        demo: true,
      }),
    [demo.data],
  );
  return { data, phase: demo.phase, clock: demo.clock, total: demo.total };
}

export default function AnalysisV2Page() {
  const queryClient = useQueryClient();
  const demoEnabled = useDemoStore((s) => s.enabled);
  const real = useAnalysisReal();
  const demo = useAnalysisDemo();
  const [metricKey, setMetricKey] = useState<AnalysisMetricKey>('turbidity');
  const [stationId, setStationId] = useState<'A' | 'B' | 'C'>('B');
  const [range, setRange] = useState<AnalysisRange>('24h');
  const [refreshing, setRefreshing] = useState(false);

  // 离开页面退出演示（内存态清理）
  useEffect(() => () => useDemoStore.getState().disable(), []);
  // 演示剧本仅 24h：进入演示时复位时间档，避免停留在 7d 空档
  useEffect(() => {
    if (demoEnabled) setRange('24h');
  }, [demoEnabled]);

  const data = demoEnabled ? demo.data : real.data;
  const reload = async () => {
    if (demoEnabled) return;
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['obs', 'analysis-trends'] });
    await queryClient.invalidateQueries({ queryKey: ['latest', 'all'] });
    setRefreshing(false);
  };

  if (!demoEnabled && real.loading) return <AnalysisSkeleton />;
  if (!data) {
    return (
      <div className="v2-scope">
        <div className="v2-page">
          <div className="v2-panel v2-state-page">
            <PanelState
              variant="error"
              title="水环境数据暂时不可用"
              desc={(real.error as Error | undefined)?.message ?? '无法连接监测数据源，请稍后重试。'}
              action={<button type="button" className="v2-btn" onClick={() => void reload()}><Icon name="refresh" size={13} />重新加载</button>}
            />
          </div>
        </div>
      </div>
    );
  }

  const metric = data.metrics.find((m) => m.key === metricKey) ?? data.metrics[0];
  const alarmMetrics = data.metrics.filter((m) => Object.values(m.status).includes('alert'));
  const classifiedStations = data.waterQuality.filter((w) => w.classIndex > 0);
  const compliant = classifiedStations.filter((w) => w.classIndex <= 2).length;
  const leadEventReach = (() => {
    const alertStation = data.stations.find((s) => s.tone === 'alert');
    return alertStation?.name.replace(' 断面', '') ?? undefined;
  })();
  const eventWindow: [number, number] | undefined = undefined; // 真实事件区间由研判时间线为准，图表不虚构区间
  const dataAsOfLabel = data.dataAsOf
    ? data.dataAsOf.slice(5, 16).replace('T', ' ')
    : data.updatedAt;
  const trendSource = data.trendSources[metric.key] ?? summarizeObservationSource([]);
  const trendBadge = demoEnabled ? 'SIMULATED · 演示序列' : `${trendSource.code} · ${trendSource.label}`;
  const trendDesc = demoEnabled ? '场景演示序列（内存回放，不落库）' : trendSource.desc;

  return (
    <div className="v2-scope">
      <div className="v2-page v2-analysis-page">
        {demoEnabled && (
          <div className="v2-demo-banner" role="alert" style={{ marginBottom: 12 }}>
            <span className="v2-demo-banner__flag">场景演示 · 模拟数据</span>
            <span className="v2-demo-banner__phase">
              当前阶段：{demo.phase.label} · 演示时间 {demo.data.updatedAt}
            </span>
            <div className="v2-demo-banner__controls">
              <button type="button" className="v2-demo-ctl v2-demo-ctl--exit" onClick={() => useDemoStore.getState().disable()}>
                退出演示
              </button>
            </div>
          </div>
        )}

        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>{demoEnabled ? 'SCENARIO DEMO · SIMULATED · 内存回放' : `ANALYSIS · ${dataAsOfLabel} · ${data.scenario}`}</span>
              {demoEnabled ? (
                <span className="v2-intro-sync v2-mono">演示模式 · 数据不落库</span>
              ) : (
                <>
                  <button type="button" className="v2-intro-sync" onClick={() => useDemoStore.getState().enable()}>
                    <Icon name="wave" size={11} />场景演示
                  </button>
                  <button type="button" className="v2-intro-sync" onClick={() => void reload()} disabled={refreshing}>
                    <Icon name="refresh" size={11} className={refreshing ? 'v2-is-spinning' : undefined} />
                    {refreshing ? '同步中' : '刷新'}
                  </button>
                </>
              )}
            </div>
            <h1 className="v2-page-title">
              水环境分析
              <em>WATER ANALYSIS</em>
            </h1>
            <p className="v2-page-situation">
              {data.stations
                .filter((s) => s.waterClass)
                .map((s) => `${s.name.replace(' 断面', '')} ${s.waterClass}类`)
                .join('、') || '官方水质类别暂未映射'}
              。{leadEventReach ? <><b className="v2-hot">{leadEventReach}</b> 存在未闭环事件，异常区间以研判时间线为准。</> : '当前无未闭环事件，图表仅展示已入库观测序列。'}
            </p>
          </div>

          <div className="v2-readouts">
            <div className="v2-readout">
              <span className="v2-readout__label">METRICS</span>
              <div className="v2-readout__value">{String(data.metrics.length).padStart(2, '0')}<small>项</small></div>
              <div className="v2-readout__sub">4 组 · 3 断面</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">OUT OF RANGE</span>
              <div className="v2-readout__value">{String(alarmMetrics.length).padStart(2, '0')}<small>项</small></div>
              <div className="v2-readout__sub">
                <span className="v2-status-dot v2-status-dot--danger" style={{ width: 5, height: 5 }} />
                {alarmMetrics.length ? alarmMetrics.map((m) => m.label).join(' · ') : '暂无超阈值指标'}
              </div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">COMPLIANT</span>
              <div className="v2-readout__value">{String(compliant).padStart(2, '0')}<small>/ 03</small></div>
              <div className="v2-readout__sub">Ⅱ类及以上断面</div>
            </div>
          </div>
        </div>

        <div className="v2-grid v2-stagger v2-analysis-grid">
          <div className="v2-col-3 v2-analysis-index">
            <MetricIndex metrics={data.metrics} stations={data.stations} selectedMetric={metric.key} selectedStation={stationId} onSelectMetric={setMetricKey} />
          </div>
          <div className="v2-col-9 v2-analysis-trend">
            <AnalysisTrendPanel
              metric={metric}
              stations={data.stations}
              selectedStation={stationId}
              range={range}
              labels={data.labels[range]}
              eventWindow={eventWindow}
              demoLabel={trendBadge}
              sourceDesc={trendDesc}
              demoMode={demoEnabled}
              leadReachName={leadEventReach}
              demoOnly24h={demoEnabled}
              onRangeChange={setRange}
              onSelectStation={setStationId}
            />
          </div>
          <div className="v2-col-5 v2-analysis-compare">
            <StationCompare metric={metric} stations={data.stations} selectedStation={stationId} onSelectStation={setStationId} />
          </div>
          <div className="v2-col-4 v2-analysis-matrix">
            <MetricMatrix
              metrics={data.metrics}
              stations={data.stations}
              selectedMetric={metric.key}
              selectedStation={stationId}
              onSelect={(m, s) => { setMetricKey(m); setStationId(s); }}
            />
          </div>
          <div className="v2-col-3 v2-analysis-wq">
            <WaterQualityPanel waterQuality={data.waterQuality} stations={data.stations} selectedStation={stationId} onSelectStation={setStationId} demo={data.demo} />
          </div>
        </div>
      </div>
    </div>
  );
}
