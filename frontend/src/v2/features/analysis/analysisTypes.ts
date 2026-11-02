import type { Station, StationId } from '../../types';

export type AnalysisMetricKey =
  | 'level'
  | 'turbidity'
  | 'ph'
  | 'oxygen'
  | 'ammonia'
  | 'codmn'
  | 'tp'
  | 'tn';

export type MetricGroup = '水文' | '感官' | '理化' | '营养盐';
export type MetricStatus = 'good' | 'watch' | 'alert';
export type AnalysisRange = '24h' | '7d';

export interface MetricLimit {
  value: number;
  label: string;
}

export interface AnalysisMetric {
  key: AnalysisMetricKey;
  label: string;
  en: string;
  unit: string;
  group: MetricGroup;
  groupEn: string;
  precision: number;
  normalRange: [number, number] | null;
  limits: MetricLimit[];
  values: Record<StationId, number | null>;
  deltas: Record<StationId, number | null>;
  /** 历史数据性质：series=连续观测可绘曲线；snapshot=仅官方最新快照；none=完全无历史 */
  historyKind: 'series' | 'snapshot' | 'none';
  /** 快照类指标的来源说明（显示于图例角标与空态文案） */
  snapshotNote?: string;
  status: Record<StationId, MetricStatus>;
  sparks: Record<StationId, number[]>;
  series: Record<AnalysisRange, Record<StationId, number[]>>;
}

export interface WaterQualityStation {
  id: StationId;
  classIndex: number;
  exceedances: { metric: string; value: string; note: string }[];
}

export interface AnalysisData {
  demo?: boolean;
  updatedAt: string;
  scenario: string;
  stations: Station[];
  labels: Record<AnalysisRange, string[]>;
  metrics: AnalysisMetric[];
  waterQuality: WaterQualityStation[];
}
