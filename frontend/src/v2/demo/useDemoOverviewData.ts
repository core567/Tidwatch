import { useEffect, useMemo } from 'react';
import { useDemoStore } from './demoStore';
import {
  buildDemoScenario, DEMO_EVENTS, DEMO_TICK_COUNT, DEMO_TURBIDITY_THRESHOLD,
  phaseOf, type DemoReachId,
} from './demoScenario';
import { STATION_MAP, STATION_ORDER } from '../features/overview/overviewAdapter';
import type { OverviewData, StationId, MetricKey, AlertItem, PipelineStage, InspectionTask, SystemStatus } from '../types';

const METRIC_ORDER: MetricKey[] = ['level', 'turbidity', 'ph', 'oxygen', 'ammonia'];
const METRIC_META: Record<MetricKey, { label: string; en: string; unit: string; precision: number }> = {
  level: { label: '水位', en: 'LEVEL', unit: 'm', precision: 2 },
  turbidity: { label: '浊度', en: 'TURBIDITY', unit: 'NTU', precision: 1 },
  ph: { label: 'pH', en: 'PH', unit: '', precision: 2 },
  oxygen: { label: '溶解氧', en: 'DO', unit: 'mg/L', precision: 2 },
  ammonia: { label: '氨氮', en: 'NH₃-N', unit: 'mg/L', precision: 3 },
};
const STATION_NAMES: Record<StationId, string> = { A: '上游 A 断面', B: '中游 B 断面', C: '下游 C 断面' };
const REACH_OF: Record<StationId, DemoReachId> = {
  A: STATION_MAP.A as DemoReachId,
  B: STATION_MAP.B as DemoReachId,
  C: STATION_MAP.C as DemoReachId,
};

/** 演示数据（内存回放）→ OverviewData；与真实适配层完全隔离 */
function buildDemoOverview(clock: number): OverviewData {
  const scenario = buildDemoScenario();
  const phase = phaseOf(clock);
  const window = scenario.slice(0, clock + 1);

  const toneOf = (id: StationId): 'good' | 'watch' | 'alert' => {
    const env = window.length ? window[window.length - 1].perReach[REACH_OF[id]] : null;
    if (!env) return 'good';
    if (phase.key === 'alert') return id === 'B' ? 'alert' : 'watch';
    if (phase.key === 'developing') return id === 'B' ? 'watch' : 'good';
    if (phase.key === 'recovery') return id === 'B' ? 'watch' : 'good';
    return 'good';
  };

  const stations = STATION_ORDER.map((id): OverviewData['stations'][number] => ({
    id,
    name: STATION_NAMES[id],
    location: '场景演示（内存）',
    waterClass: null,
    tone: toneOf(id),
    statusLabel: '模拟在线',
    distanceKm: 0,
    updatedAt: window.length ? window[window.length - 1].label : '—',
  }));

  const metrics = Object.fromEntries(
    STATION_ORDER.map((id) => {
      const values = window.map((tick) => tick.perReach[REACH_OF[id]]);
      const readouts = METRIC_ORDER.map((key) => {
        const last = values.length ? values[values.length - 1][key] : null;
        return {
          key,
          ...METRIC_META[key],
          value: last,
          deltaPct: null,
          normalRange: null,
          spark: values.map((v) => v[key]),
          observedAt: null,
          source: '场景演示',
          stale: false,
        };
      });
      return [id, readouts];
    }),
  ) as OverviewData['metrics'];

  const activeEvents = DEMO_EVENTS.filter((e) => clock >= e.fromTick && clock < e.toTick);
  const alerts: AlertItem[] = activeEvents.map((e) => ({
    id: e.id,
    stationId: (Object.entries(STATION_MAP) as [StationId, string][]).find(([, rid]) => rid === e.reachId)?.[0] ?? 'B',
    title: e.title,
    risk: e.risk,
    riskCode: 'R3',
    time: scenario[e.fromTick].label,
    status: phase.key === 'recovery' ? '恢复中' : phase.key === 'alert' ? '预警中' : '研判中',
    summary: '前端内存演示事件：异常发展 → 预警 → 恢复全流程（不写入数据库，不进入真实研判）。',
    evidenceCount: null,
    evidence: ['演示剧本', 'SIMULATED'],
    metricLabel: '浊度',
    metricValue: '> 60 NTU',
    metricDelta: 'SIMULATED',
  }));

  const pipeline: PipelineStage[] = [
    { key: 'detect', label: '异常发现', en: 'DETECT', count: phase.key === 'baseline' ? 0 : 1, hint: '演示剧本驱动', active: phase.key === 'developing' },
    { key: 'judge', label: '智能研判', en: 'ASSESS', count: phase.key === 'alert' || phase.key === 'recovery' ? 1 : 0, hint: '演示剧本驱动', active: phase.key === 'alert' },
    { key: 'dispatch', label: '任务派发', en: 'DISPATCH', count: phase.key === 'alert' || phase.key === 'recovery' ? 1 : 0, hint: '演示剧本驱动' },
    { key: 'field', label: '现场处置', en: 'FIELD', count: phase.key === 'recovery' ? 1 : 0, hint: '演示剧本驱动' },
    { key: 'review', label: '复核闭环', en: 'REVIEW', count: phase.key === 'recovery' ? 1 : 0, hint: '演示剧本驱动' },
  ];

  const inspections: InspectionTask[] =
    phase.key === 'alert' || phase.key === 'recovery'
      ? [{
          id: 'DEMO-TASK-1',
          title: '场景演示：中游 B 现场核查（内存任务）',
          stationId: 'B',
          assignee: '演示巡检员',
          status: phase.key === 'alert' ? '进行中' : '待复核',
          time: scenario[Math.max(0, clock - 6)].label,
          priority: '高',
        }]
      : [];

  const incidents = DEMO_EVENTS.filter((e) => clock >= e.fromTick).map((e) => ({
    id: e.id,
    time: scenario[e.fromTick].label,
    stationId: 'B' as StationId,
    title: e.title,
    risk: 'high' as const,
    status: clock >= e.toTick ? '已恢复' : phase.key === 'alert' ? '预警中' : '研判中',
  }));

  const system: SystemStatus = {
    backend: { online: true, latencyMs: null },
    sources: [
      { name: '演示数据源（内存）', type: 'demo', online: true, latency: 'SIMULATED', updatedAt: '—', note: '前端回放 · 不落库' },
      { name: '后端服务', type: 'backend', online: true, latency: '—', updatedAt: '—', note: '真实接口未受影响' },
      { name: '实时通道(SSE)', type: 'realtime', online: true, latency: '独立', updatedAt: '—', note: '演示模式不消费业务消息' },
    ],
    updatedAt: scenario[clock].label,
    uptime: '—',
  };

  const seriesFor = (key: 'turbidity') =>
    STATION_ORDER.map((id) => ({
      id,
      name: STATION_NAMES[id].replace(' 断面', ''),
      data: window.map((tick) => tick.perReach[REACH_OF[id]][key]),
    }));

  return {
    scenario: `场景演示 · ${phase.label}`,
    updatedAt: `DEMO ${scenario[clock].label}`,
    stations,
    metrics,
    alerts,
    pipeline,
    inspections,
    incidents,
    trend: {
      '24h': {
        labels: window.map((t) => t.label),
        series: seriesFor('turbidity'),
        threshold: DEMO_TURBIDITY_THRESHOLD,
        eventWindow: activeEvents.length
          ? [Math.max(0, DEMO_EVENTS[0].fromTick), Math.min(window.length - 1, DEMO_EVENTS[0].toTick - 1)]
          : [-1, -1],
        unit: 'NTU',
      },
      '7d': {
        labels: window.map((t) => t.label),
        series: seriesFor('turbidity'),
        threshold: DEMO_TURBIDITY_THRESHOLD,
        eventWindow: [-1, -1],
        unit: 'NTU',
      },
    },
    system,
    summary: {
      backendStatus: 'ok',
      activeEventCount: alerts.length,
      stationCount: 3,
      reachesOnline: 3,
      latestObservedAt: null,
      taskRunning: inspections.filter((t) => t.status === '进行中').length,
      taskPendingReview: inspections.filter((t) => t.status === '待复核').length,
      taskCompleted: phase.key === 'recovery' ? 1 : 0,
    },
  };
}

/**
 * 演示数据源 hook（供首页使用；F3 数字孪生可直接复用 demoStore + 本 hook）。
 * - 计时器在此持有：enabled 且 playing 时按倍速推进演示时钟。
 * - 组件卸载或 disable 时清理计时器，不留后台任务。
 */
export function useDemoOverviewData() {
  const enabled = useDemoStore((s) => s.enabled);
  const playback = useDemoStore((s) => s.playback);
  const clock = useDemoStore((s) => s.clock);
  const speed = useDemoStore((s) => s.speed);
  const advance = useDemoStore((s) => s.advance);

  useEffect(() => {
    if (!enabled || playback !== 'playing') return;
    const id = window.setInterval(advance, 1000 / speed);
    return () => window.clearInterval(id);
  }, [enabled, playback, speed, advance]);

  const data = useMemo(() => buildDemoOverview(clock), [clock]);
  return { data, clock, phase: phaseOf(clock), total: DEMO_TICK_COUNT };
}
