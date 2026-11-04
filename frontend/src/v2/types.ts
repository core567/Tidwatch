/**
 * 新版视觉数据形状（对应 TidewatchWeb data/types.ts）。
 * F2 起由 overviewAdapter 从主项目真实 API 数据映射而来；
 * 部分字段在真实数据缺失时可为 null（UI 显示"暂无/—"，不伪造数值）。
 */

export type StationId = 'A' | 'B' | 'C';
export type StationTone = 'good' | 'watch' | 'alert';
export type RiskLevel = 'high' | 'medium' | 'low';
export type WaterClass = 'Ⅰ' | 'Ⅱ' | 'Ⅲ' | 'Ⅳ' | 'Ⅴ';

export interface Station {
  id: StationId;
  name: string;
  location: string;
  waterClass: string | null;
  tone: StationTone;
  statusLabel: string;
  distanceKm: number;
  updatedAt: string;
}

export type MetricKey = 'level' | 'turbidity' | 'ph' | 'oxygen' | 'ammonia';

export interface MetricReadout {
  key: MetricKey;
  label: string;
  en: string;
  unit: string;
  value: number | null;
  precision: number;
  deltaPct: number | null;
  normalRange: [number, number] | null;
  spark: number[];
  observedAt: string | null;
  /** 数据来源标注（如 官方自动站），未提供时按原渠道展示 */
  source?: string | null;
  /** 官方自动站数据陈旧标记（dataState=STALE） */
  stale?: boolean;
}

export interface AlertItem {
  id: string;
  stationId: StationId;
  title: string;
  risk: RiskLevel;
  riskCode: string;
  time: string;
  status: string;
  summary: string;
  evidenceCount: number | null;
  evidence: string[];
  metricLabel: string;
  metricValue: string;
  metricDelta: string;
}

export interface PipelineStage {
  key: string;
  label: string;
  en: string;
  count: number;
  hint: string;
  active?: boolean;
}

export type InspectionStatus = '待派发' | '进行中' | '待复核';

export interface InspectionTask {
  id: string;
  title: string;
  stationId: StationId;
  assignee: string;
  status: InspectionStatus;
  time: string;
  priority: '高' | '中' | '低';
}

export interface IncidentRecord {
  id: string;
  time: string;
  stationId: StationId;
  title: string;
  risk: RiskLevel;
  status: string;
}

export interface TrendSeries {
  id: StationId;
  name: string;
  data: number[];
}

export interface TrendDataset {
  labels: string[];
  series: TrendSeries[];
  threshold: number;
  eventWindow: [number, number];
  unit: string;
}

export interface SystemSource {
  name: string;
  type: string;
  online: boolean;
  latency: string;
  updatedAt: string;
  note: string;
}

export interface SystemStatus {
  backend: { online: boolean; latencyMs: number | null };
  sources: SystemSource[];
  updatedAt: string;
  uptime: string;
}

export interface OverviewData {
  scenario: string;
  updatedAt: string;
  stations: Station[];
  metrics: Record<StationId, MetricReadout[]>;
  alerts: AlertItem[];
  pipeline: PipelineStage[];
  inspections: InspectionTask[];
  incidents: IncidentRecord[];
  trend: { '24h': TrendDataset; '7d': TrendDataset };
  system: SystemStatus;
  // 顶部摘要（真实口径：后端状态 / 活动事件 / 断面 / 任务）
  summary: {
    backendStatus: 'ok' | 'degraded' | 'error';
    activeEventCount: number;
    stationCount: number;
    /** 物理站点在线数（来自 reach.onlineStatus，与历史观测可用性无关） */
    reachesOnline: number;
    /** 最新观测时间（真实数据时间，非页面刷新时间） */
    latestObservedAt: string | null;
    taskRunning: number;
    taskPendingReview: number;
    /** 已完成任务数（APPROVED，看板三列之外的真实闭环口径） */
    taskCompleted: number;
  };
}
