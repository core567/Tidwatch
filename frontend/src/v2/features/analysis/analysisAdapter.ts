/**
 * AnalysisAdapter：把首页聚合数据（真实 API 或演示内存，同构 OverviewData）
 * 与官方自动站数据映射为分析页 AnalysisData。
 * - 站点映射唯一入口沿用 overviewAdapter 的 STATION_MAP
 * - 无真实口径的字段（normalRange/deltas）置 null，UI 显示"—"，不编造
 * - 浊度阈值 60 NTU 来自后端 rules/thresholds.py
 */
import type { OfficialAutoRecord, ActiveEvent } from '@/types/contract';
import type { OverviewData, StationId } from '../../types';
import type { ObservationSourceSummary } from '@/lib/observationSource';
import { STATION_MAP, STATION_ORDER } from '../overview/overviewAdapter';
import type {
  AnalysisData, AnalysisMetric, AnalysisMetricKey, AnalysisRange, MetricGroup, MetricStatus, WaterQualityStation,
} from './analysisTypes';

export const TURBIDITY_THRESHOLD = 60;
export const LEVEL_THRESHOLD = 8.5;

const METRIC_DEFS: {
  key: AnalysisMetricKey; label: string; en: string; unit: string; group: MetricGroup; groupEn: string; precision: number;
  source: 'overview' | 'official'; overviewKey?: keyof OverviewData['metrics']['A'][number] extends never ? never : string; officialField?: keyof OfficialAutoRecord;
}[] = [
  { key: 'level', label: '水位', en: 'LEVEL', unit: 'm', group: '水文', groupEn: 'HYDRO', precision: 2, source: 'overview', overviewKey: 'level' },
  { key: 'turbidity', label: '浊度', en: 'TURBIDITY', unit: 'NTU', group: '感官', groupEn: 'SENSORY', precision: 1, source: 'overview', overviewKey: 'turbidity' },
  { key: 'ph', label: 'pH', en: 'PH', unit: '', group: '理化', groupEn: 'PHYS-CHEM', precision: 2, source: 'overview', overviewKey: 'ph' },
  { key: 'oxygen', label: '溶解氧', en: 'DO', unit: 'mg/L', group: '理化', groupEn: 'PHYS-CHEM', precision: 2, source: 'overview', overviewKey: 'oxygen' },
  { key: 'ammonia', label: '氨氮', en: 'NH₃-N', unit: 'mg/L', group: '营养盐', groupEn: 'NUTRIENT', precision: 3, source: 'overview', overviewKey: 'ammonia' },
  { key: 'codmn', label: '高锰酸盐指数', en: 'CODMN', unit: 'mg/L', group: '理化', groupEn: 'PHYS-CHEM', precision: 2, source: 'official', officialField: 'codMn' },
  { key: 'tp', label: '总磷', en: 'TP', unit: 'mg/L', group: '营养盐', groupEn: 'NUTRIENT', precision: 3, source: 'official', officialField: 'totalPhosphorus' },
  { key: 'tn', label: '总氮', en: 'TN', unit: 'mg/L', group: '营养盐', groupEn: 'NUTRIENT', precision: 2, source: 'official', officialField: 'totalNitrogen' },
];

export interface TrendSeriesInput {
  labels: string[];
  perReach: Record<string, number[]>;
}

export interface AnalysisAdapterInput {
  overview: OverviewData;
  officialByReach: Record<string, OfficialAutoRecord>;
  activeEvents: ActiveEvent[];
  /** 有真实序列的指标（turbidity/waterLevel），其余指标序列为空并显示空态 */
  trends: Record<string, Record<AnalysisRange, TrendSeriesInput>>;
  /** 各指标序列的实际观测来源 */
  trendSources?: Record<string, ObservationSourceSummary>;
  demo?: boolean;
}

const CLASS_INDEX: Record<string, number> = { 'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5 };

export function buildAnalysisData(input: AnalysisAdapterInput): AnalysisData {
  const { overview, officialByReach, activeEvents, trends, trendSources = {}, demo = false } = input;
  const reachIds = Object.fromEntries(STATION_ORDER.map((id) => [id, STATION_MAP[id]])) as Record<StationId, string>;

  const labels: Record<AnalysisRange, string[]> = {
    '24h': trends.turbidity?.['24h']?.labels ?? [],
    '7d': trends.turbidity?.['7d']?.labels ?? [],
  };

  const metrics: AnalysisMetric[] = METRIC_DEFS.map((def) => {
    const values = {} as Record<StationId, number | null>;
    const deltas = {} as Record<StationId, number | null>;
    const status = {} as Record<StationId, MetricStatus>;
    const sparks = {} as Record<StationId, number[]>;
    const series = {} as Record<AnalysisRange, Record<StationId, number[]>>;

    for (const id of STATION_ORDER) {
      let value: number | null = null;
      let stale = false;
      if (def.source === 'overview') {
        const m = overview.metrics[id].find((x) => x.key === def.key);
        value = m?.value ?? null;
        stale = m?.stale === true;
      } else if (def.officialField) {
        const rec = officialByReach[reachIds[id]];
        const raw = rec?.[def.officialField];
        value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        stale = rec?.dataState === 'STALE';
      }
      values[id] = value;
      deltas[id] = null;
      // 逐指标阈值判定：只有该指标真实越限才标红；站点事件状态不放大到所有指标。
      const exceeded = value !== null && (
        (def.key === 'turbidity' && value > TURBIDITY_THRESHOLD) ||
        (def.key === 'level' && value >= LEVEL_THRESHOLD)
      );
      status[id] = exceeded ? 'alert' : stale || value === null ? 'watch' : 'good';
      sparks[id] = overview.metrics[id].find((x) => x.key === def.key)?.spark ?? [];
      for (const range of ['24h', '7d'] as AnalysisRange[]) {
        const t = trends[def.key]?.[range];
        series[range] = series[range] ?? ({} as Record<StationId, number[]>);
        series[range][id] = t ? (t.perReach[reachIds[id]] ?? []) : [];
      }
    }

    // 数据性质判定：有真实/演示连续序列 → series；无序列但属于 MQTT 指标（窗口空）→ series；
    // 其余官方快照指标 → snapshot。演示剧本提供五指标序列，自动落入 series。
    const hasTrendSeries = (trends[def.key]?.['24h']?.labels?.length ?? 0) > 0;
    const historyKind: 'series' | 'snapshot' | 'none' = hasTrendSeries
      ? 'series'
      : def.key === 'level' || def.key === 'turbidity'
        ? 'series'
        : 'snapshot';
    const snapshotNote = '官方自动站日频发布 · 仅保存最新快照';

    return {
      key: def.key,
      label: def.label,
      en: def.en,
      unit: def.unit,
      group: def.group,
      groupEn: def.groupEn,
      precision: def.precision,
      normalRange: null,
      limits: def.key === 'turbidity'
        ? [{ value: TURBIDITY_THRESHOLD, label: '预警阈值' }]
        : def.key === 'level'
          ? [{ value: LEVEL_THRESHOLD, label: '预警阈值' }]
          : [],
      historyKind,
      snapshotNote,
      values,
      deltas,
      status,
      sparks,
      series,
    };
  });

  const waterQuality: WaterQualityStation[] = overview.stations.map((s) => {
    const cls = s.waterClass;
    // 只把触发断面归到该站点的预警；范围包含不扩展到触发断面以免误标。
    const event = activeEvents.find((e) => e.trigger?.reachId === STATION_MAP[s.id]);
    return {
      id: s.id,
      classIndex: cls && CLASS_INDEX[cls] ? CLASS_INDEX[cls] : 0,
      exceedances: event?.trigger
        ? [{ metric: event.trigger.metric, value: `${event.trigger.direction === 'UP' ? '↑' : '↓'} ${event.trigger.magnitude}`, note: `活动事件 ${event.eventId} 触发` }]
        : [],
    };
  });

  return {
    demo,
    updatedAt: overview.updatedAt,
    dataAsOf: overview.summary.latestObservedAt ?? null,
    scenario: demo ? '场景演示 · 模拟数据' : overview.scenario,
    stations: overview.stations,
    labels,
    metrics,
    waterQuality,
    trendSources,
  };
}
