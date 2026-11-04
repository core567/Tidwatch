/**
 * OverviewAdapter：把主项目真实 API 数据映射为 v2 首页数据形状。
 * 唯一的站点 ID 映射点（禁止散落硬编码）：
 *   A → reach-a，B → reach-b，C → reach-c
 * 口径原则：真实数据缺失时置 null/空，UI 显示"暂无"，不编造。
 */
import type { Reach, ActiveEvent, InspectionTask as ApiTask, Observation, HealthResponse, OfficialAutoRecord } from '@/types/contract';
import { EVENT_STATUS, formatTime, REACH_NAME } from '@/components/EventBits';
import type {
  OverviewData, Station, StationId, StationTone, MetricReadout, MetricKey,
  AlertItem, PipelineStage, InspectionTask, InspectionStatus, IncidentRecord,
  TrendDataset, TrendSeries, RiskLevel,
} from '../../types';

export const STATION_MAP: Record<StationId, string> = {
  A: 'reach-a',
  B: 'reach-b',
  C: 'reach-c',
};

export const STATION_ORDER: StationId[] = ['A', 'B', 'C'];

export function stationIdOf(reachId: string): StationId {
  const hit = (Object.entries(STATION_MAP) as [StationId, string][]).find(
    ([, rid]) => rid === reachId,
  );
  return hit ? hit[0] : 'B';
}

/** 主项目观测指标名 → v2 MetricKey */
const METRIC_KEY_MAP: Record<string, MetricKey> = {
  waterLevel: 'level',
  turbidity: 'turbidity',
  ph: 'ph',
  dissolvedOxygen: 'oxygen',
  ammoniaN: 'ammonia',
};

const METRIC_DEF: Record<MetricKey, { label: string; en: string; unit: string; precision: number }> = {
  level: { label: '水位', en: 'LEVEL', unit: 'm', precision: 2 },
  turbidity: { label: '浊度', en: 'TURBIDITY', unit: 'NTU', precision: 1 },
  ph: { label: 'pH', en: 'PH', unit: '', precision: 2 },
  oxygen: { label: '溶解氧', en: 'DO', unit: 'mg/L', precision: 2 },
  ammonia: { label: '氨氮', en: 'NH₃-N', unit: 'mg/L', precision: 3 },
};

const METRIC_KEYS: MetricKey[] = ['level', 'turbidity', 'ph', 'oxygen', 'ammonia'];

const EVENT_RISK_CODE: Record<string, string> = { HIGH: 'R3', NORMAL: 'R2', LOW: 'R1' };

function riskOf(priority: string): RiskLevel {
  return priority === 'HIGH' ? 'high' : priority === 'LOW' ? 'low' : 'medium';
}

function toneOf(reach: Reach, abnormalIds: Set<string>): StationTone {
  if (abnormalIds.has(reach.reachId)) return 'alert';
  if (reach.onlineStatus === 'STALE' || reach.onlineStatus === 'OFFLINE') return 'watch';
  return 'good';
}

function statusLabelOf(reach: Reach): string {
  return reach.onlineStatus === 'ONLINE' ? '在线' : reach.onlineStatus === 'STALE' ? '数据陈旧' : '离线';
}

const shortTime = (iso: string): string => formatTime(iso).slice(5);

function emptyMetric(key: MetricKey): MetricReadout {
  return {
    key, ...METRIC_DEF[key],
    value: null, deltaPct: null, normalRange: null, spark: [], observedAt: null,
  };
}

/** 官方自动站字段 → v2 指标 key（仅本断面自身的官方数据，绝不跨断面复制） */
const OFFICIAL_FIELD: Record<string, MetricKey> = {
  ph: 'ph',
  dissolvedOxygen: 'oxygen',
  ammoniaN: 'ammonia',
};

function buildMetrics(
  latest: Observation[],
  sparkByMetric: Record<string, number[]>,
  official: OfficialAutoRecord | null | undefined,
): MetricReadout[] {
  const byMetric = new Map(latest.map((o) => [o.metric, o]));
  return METRIC_KEYS.map((key) => {
    const src = (Object.entries(METRIC_KEY_MAP) as [string, MetricKey][]).find(([, k]) => k === key);
    if (!src) return emptyMetric(key);
    const [metric] = src;
    const obs = byMetric.get(metric);
    const good = obs && obs.qualityFlag === 'GOOD' ? obs : undefined;
    if (good) {
      return {
        key, ...METRIC_DEF[key],
        value: good.value, deltaPct: null, normalRange: null,
        spark: sparkByMetric[metric] ?? [], observedAt: good.observedAt,
      };
    }
    // 官方自动站回退：仅 pH/溶解氧/氨氮；STALE 明确标记
    const officialField = (Object.entries(OFFICIAL_FIELD) as [string, MetricKey][]).find(([, k]) => k === key);
    if (officialField && official) {
      const raw = official[officialField[0] as keyof OfficialAutoRecord];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      if (value !== null) {
        return {
          key, ...METRIC_DEF[key],
          value, deltaPct: null, normalRange: null, spark: [],
          observedAt: official.observedAt ?? null,
          source: '官方自动站',
          stale: official.dataState === 'STALE',
        };
      }
    }
    return { ...emptyMetric(key), spark: sparkByMetric[metric] ?? [] };
  });
}

export interface TrendSeriesInput {
  labels: string[];
  values: number[];
  timestamps: string[];
}

function buildTrendDataset(
  seriesByReach: Record<string, TrendSeriesInput>,
  stationIds: StationId[],
  eventFirstSeenAt?: string | null,
): TrendDataset {
  const ref = seriesByReach[STATION_MAP.B] ?? seriesByReach[STATION_MAP.A] ?? seriesByReach[STATION_MAP.C];
  const labels = ref?.labels ?? [];
  const series: TrendSeries[] = stationIds.map((id) => {
    const s = seriesByReach[STATION_MAP[id]];
    return {
      id,
      name: REACH_NAME[STATION_MAP[id]] ?? id,
      data: labels.map((_label, i) => s?.values[i] ?? (s?.values.length === 1 ? s.values[0] : NaN)),
    };
  });
  // 异常区间：从头号事件触发时刻到序列末尾（无事件或事件不在窗口内时不标注）
  let eventWindow: [number, number] = [-1, -1];
  if (eventFirstSeenAt && ref?.timestamps.length) {
    const eventTs = new Date(eventFirstSeenAt).getTime();
    if (Number.isFinite(eventTs)) {
      const startIdx = ref.timestamps.findIndex((ts) => new Date(ts).getTime() >= eventTs);
      if (startIdx >= 0 && startIdx < ref.timestamps.length - 1) {
        eventWindow = [startIdx, ref.timestamps.length - 1];
      }
    }
  }
  return { labels, series, threshold: 60, eventWindow, unit: 'NTU' };
}

export interface OverviewAdapterInput {
  reaches: Reach[];
  latestByReach: Record<string, Observation[]>;
  sparkByReach: Record<string, Record<string, number[]>>;
  activeEvents: ActiveEvent[];
  recentEvents: ActiveEvent[];
  tasks: ApiTask[];
  taskTotalByStatus: Record<string, number>;
  eventFrequency: { byStatus: Record<string, number> };
  health: HealthResponse;
  mqtt: { enabled: boolean; connected: boolean; host?: string | null; port?: number | null } | null;
  scenario: { running: boolean; scenario: string | null };
  streamState: string;
  officialWaterClass: Record<string, string | null>;
  officialByReach: Record<string, OfficialAutoRecord>;
  trend24h: Record<string, TrendSeriesInput>;
  trend7d: Record<string, TrendSeriesInput>;
  leadEventFirstSeenAt?: string | null;
}

export function buildOverviewData(input: OverviewAdapterInput): OverviewData {
  const reaches = [...input.reaches].sort((a, b) => a.topoOrder - b.topoOrder);
  const stationsById = new Map(reaches.map((r) => [r.reachId, r]));
  const abnormalIds = new Set(input.activeEvents.flatMap((e) => e.scopeReachIds));

  const stations: Station[] = STATION_ORDER.map((id) => {
    const rid = STATION_MAP[id];
    const reach = stationsById.get(rid);
    if (!reach) {
      return {
        id, name: REACH_NAME[rid] ?? id, location: '', waterClass: null,
        tone: 'watch', statusLabel: '未知', distanceKm: 0, updatedAt: '—',
      };
    }
    return {
      id,
      name: reach.name || REACH_NAME[rid] || id,
      location: reach.coordinateStatus === 'VERIFIED' ? '已核实' : '逻辑示意',
      waterClass: input.officialWaterClass[rid] ?? null,
      tone: toneOf(reach, abnormalIds),
      statusLabel: statusLabelOf(reach),
      distanceKm: 0,
      updatedAt: reach.lastSeenAt ? shortTime(reach.lastSeenAt) : '—',
    };
  });

  const metrics = Object.fromEntries(
    STATION_ORDER.map((id) => {
      const rid = STATION_MAP[id];
      return [id, buildMetrics(input.latestByReach[rid] ?? [], input.sparkByReach[rid] ?? {}, input.officialByReach[rid])];
    }),
  ) as OverviewData['metrics'];

  const alerts: AlertItem[] = input.activeEvents.map((e) => {
    const reachId = e.scopeReachIds[0] ?? STATION_MAP.B;
    const trigger = e.trigger;
    return {
      id: e.eventId,
      stationId: stationIdOf(reachId),
      title: e.title,
      risk: riskOf(e.priority),
      riskCode: EVENT_RISK_CODE[e.priority] ?? 'R2',
      time: shortTime(e.firstSeenAt),
      status: EVENT_STATUS[e.status]?.text ?? e.status,
      summary: `类型 ${e.eventType}${trigger ? ` · ${trigger.metric} ${trigger.direction === 'UP' ? '升高' : '降低'} ${trigger.magnitude}` : ''}`,
      evidenceCount: null,
      evidence: e.scopeReachIds.map((rid) => REACH_NAME[rid] ?? rid),
      metricLabel: trigger?.metric ?? '—',
      metricValue: trigger ? `${trigger.direction === 'UP' ? '↑' : '↓'} ${trigger.magnitude}` : '—',
      metricDelta: '见研判工作台',
    };
  });

  const pipeline: PipelineStage[] = [
    {
      key: 'detect', label: '异常发现', en: 'DETECT',
      count: input.eventFrequency.byStatus.OPEN ?? 0,
      hint: '当前待初查事件', active: (input.eventFrequency.byStatus.OPEN ?? 0) > 0,
    },
    {
      key: 'judge', label: '智能研判', en: 'ASSESS',
      count: (input.eventFrequency.byStatus.INVESTIGATING ?? 0) + (input.eventFrequency.byStatus.MONITORING ?? 0),
      hint: '研判中与持续观察事件',
      active: (input.eventFrequency.byStatus.OPEN ?? 0) === 0 && ((input.eventFrequency.byStatus.INVESTIGATING ?? 0) + (input.eventFrequency.byStatus.MONITORING ?? 0)) > 0,
    },
    {
      key: 'dispatch', label: '任务派发', en: 'DISPATCH',
      count: (input.taskTotalByStatus.PENDING ?? 0) + (input.taskTotalByStatus.ACCEPTED ?? 0),
      hint: '已派发 / 已接单任务',
    },
    {
      key: 'field', label: '现场处置', en: 'FIELD',
      count: input.taskTotalByStatus.IN_PROGRESS ?? 0,
      hint: '执行中任务',
    },
    {
      key: 'review', label: '复核闭环', en: 'REVIEW',
      count: input.taskTotalByStatus.SUBMITTED ?? 0,
      hint: '待复核任务',
    },
  ];

  const TASK_STATUS_TO_BOARD: Record<string, InspectionStatus> = {
    PENDING: '待派发',
    ACCEPTED: '进行中',
    IN_PROGRESS: '进行中',
    SUBMITTED: '待复核',
  };

  const inspections: InspectionTask[] = input.tasks
    .filter((t) => TASK_STATUS_TO_BOARD[t.status])
    .slice(0, 12)
    .map((t) => ({
      id: t.taskId,
      title: t.title,
      stationId: stationIdOf(t.reachId),
      assignee: t.assignee ?? '未指派',
      status: TASK_STATUS_TO_BOARD[t.status],
      time: shortTime(t.createdAt),
      priority: t.priority === 'HIGH' ? '高' : t.priority === 'LOW' ? '低' : '中',
    }));

  const incidents: IncidentRecord[] = input.recentEvents.slice(0, 5).map((e) => ({
    id: e.eventId,
    time: shortTime(e.firstSeenAt),
    stationId: stationIdOf(e.scopeReachIds[0] ?? STATION_MAP.B),
    title: e.title,
    risk: riskOf(e.priority),
    status: EVENT_STATUS[e.status]?.text ?? e.status,
  }));

  const mqttNote = input.mqtt
    ? input.mqtt.connected ? 'MQTT 已连接' : input.mqtt.enabled ? 'MQTT 未连接' : 'MQTT 未启用'
    : 'MQTT 状态未知';

  const system: OverviewData['system'] = {
    backend: { online: input.health.status === 'ok' || input.health.status === 'degraded', latencyMs: null },
    sources: [
      {
        name: '后端服务', type: 'backend', online: input.health.status === 'ok',
        latency: '—', updatedAt: '—', note: `database ${input.health.database}`,
      },
      {
        name: '实时通道(SSE)', type: 'realtime', online: input.streamState === 'open',
        latency: input.streamState, updatedAt: '—', note: input.streamState === 'open' ? '已连接' : '未连接',
      },
      {
        name: 'MQTT 摄入', type: 'mqtt', online: input.mqtt?.connected ?? false,
        latency: input.mqtt?.host ?? '—', updatedAt: '—', note: mqttNote,
      },
      {
        name: '场景模拟引擎', type: 'simulator', online: !input.scenario.running,
        latency: input.scenario.running ? '运行中' : '空闲', updatedAt: '—',
        note: input.scenario.scenario ?? '未运行场景',
      },
    ],
    updatedAt: new Date().toTimeString().slice(0, 8),
    uptime: '—',
  };

  const scenario = input.scenario.running && input.scenario.scenario ? input.scenario.scenario : '常规监测';
  const reachesOnline = reaches.filter((reach) => reach.onlineStatus === 'ONLINE').length;
  const observedTimes = [
    ...Object.values(input.latestByReach).flat().map((obs) => obs.observedAt),
    ...Object.values(input.officialByReach).map((rec) => rec.observedAt),
  ].filter(Boolean);
  const latestObservedAt = observedTimes.length
    ? observedTimes.reduce((latest, current) => (Date.parse(current) > Date.parse(latest) ? current : latest))
    : null;

  return {
    scenario,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    stations,
    metrics,
    alerts,
    pipeline,
    inspections,
    incidents,
    trend: {
      '24h': buildTrendDataset(input.trend24h, STATION_ORDER, input.leadEventFirstSeenAt),
      '7d': buildTrendDataset(input.trend7d, STATION_ORDER, input.leadEventFirstSeenAt),
    },
    system,
    summary: {
      backendStatus: input.health.status,
      activeEventCount: input.activeEvents.length,
      stationCount: stations.length,
      reachesOnline,
      latestObservedAt,
      taskRunning: input.taskTotalByStatus.IN_PROGRESS ?? 0,
      taskPendingReview: input.taskTotalByStatus.SUBMITTED ?? 0,
      taskCompleted: input.taskTotalByStatus.APPROVED ?? 0,
    },
  };
}
