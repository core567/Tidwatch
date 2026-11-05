import type { ActiveEvent } from '@/types/contract';

export type AlertSeverity = 'severe' | 'general' | 'recovery';
export type AlertKind = 'new' | 'escalated' | 'reopened' | 'recovered';

export interface SeenEventState {
  status: string;
  priority: string;
  version: number;
  updatedAt: string;
}

export interface AlertDecision {
  kind: AlertKind;
  severity: AlertSeverity;
}

export interface GlobalAlertItem {
  id: string;
  eventId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  status: string;
  statusLabel: string;
  priority: string;
  station: string;
  reachId: string;
  metricLabel: string;
  value: string;
  threshold: string;
  at: string;
  read: boolean;
  to: string;
}

const PRIORITY_RANK: Record<string, number> = { LOW: 0, NORMAL: 1, HIGH: 2 };
const ACTIVE_STATUSES = new Set([
  'OPEN', 'INVESTIGATING', 'MONITORING', 'ESCALATED', 'NARROWED', 'RECOVERY_PENDING',
]);
const TERMINAL_STATUSES = new Set(['RECOVERED', 'UNRESOLVED']);

const STATUS_LABELS: Record<string, string> = {
  OPEN: '待初查',
  INVESTIGATING: '研判中',
  MONITORING: '持续观察',
  ESCALATED: '已升级',
  NARROWED: '范围收窄',
  RECOVERY_PENDING: '待确认恢复',
  RECOVERED: '已恢复',
  UNRESOLVED: '无法判定',
};

const METRIC_LABELS: Record<string, string> = {
  waterLevel: '水位',
  turbidity: '浊度',
  flowLevel: '水流等级',
};

const REACH_LABELS: Record<string, string> = {
  'reach-a': '上游 A',
  'reach-b': '中游 B',
  'reach-c': '下游 C',
};

export function priorityRank(priority: string | null | undefined): number {
  return PRIORITY_RANK[priority ?? ''] ?? 0;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function metricLabel(metric: string | null | undefined): string {
  if (!metric) return '异常指标';
  return METRIC_LABELS[metric] ?? metric;
}

export function stationLabel(reachId: string | null | undefined): string {
  if (!reachId) return '未知断面';
  return REACH_LABELS[reachId] ?? reachId;
}

export interface AlertRuleParams {
  waterLevelFlood: number;
  waterLevelWatch: number;
  turbidityMuddy: number;
}

/** 与 backend/app/rules/thresholds.py 的 demo-rules-v1 保持一致，仅作接口不可用时的兜底。 */
export const DEMO_ALERT_RULE_PARAMS: AlertRuleParams = {
  waterLevelFlood: 8.5,
  waterLevelWatch: 7.0,
  turbidityMuddy: 60,
};

function positive(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

/** diagnostics.ruleParams 为 snake_case；缺失或非法时回退到 demo 规则。 */
export function parseRuleParams(raw?: Record<string, number> | null): AlertRuleParams {
  return {
    waterLevelFlood: positive(raw?.water_level_flood, DEMO_ALERT_RULE_PARAMS.waterLevelFlood),
    waterLevelWatch: positive(raw?.water_level_watch, DEMO_ALERT_RULE_PARAMS.waterLevelWatch),
    turbidityMuddy: positive(raw?.turbidity_muddy, DEMO_ALERT_RULE_PARAMS.turbidityMuddy),
  };
}

export function thresholdLabel(
  event: Pick<ActiveEvent, 'trigger' | 'priority'>,
  params: AlertRuleParams = DEMO_ALERT_RULE_PARAMS,
): string {
  const metric = event.trigger?.metric;
  if (metric === 'waterLevel') {
    const value = event.priority === 'HIGH' ? params.waterLevelFlood : params.waterLevelWatch;
    return `${value.toFixed(1)} m`;
  }
  if (metric === 'turbidity') return `${params.turbidityMuddy} NTU`;
  return '—';
}

export function severityFor(event: Pick<ActiveEvent, 'priority' | 'status'>): AlertSeverity {
  if (event.status === 'RECOVERED') return 'recovery';
  return event.priority === 'HIGH' || event.status === 'ESCALATED' ? 'severe' : 'general';
}

/** 只有新增、升级、重新打开、恢复才返回告警；持续推送/范围扩展返回 null。 */
export function decideAlert(
  previous: SeenEventState | undefined,
  event: Pick<ActiveEvent, 'status' | 'priority' | 'version'>,
): AlertDecision | null {
  if (event.status === 'RECOVERED') {
    if (previous && previous.status !== 'RECOVERED') {
      return { kind: 'recovered', severity: 'recovery' };
    }
    return null;
  }
  if (TERMINAL_STATUSES.has(event.status) && !previous) return null;

  const severity = severityFor(event);
  if (!previous) {
    return { kind: 'new', severity };
  }
  if (TERMINAL_STATUSES.has(previous.status) && ACTIVE_STATUSES.has(event.status)) {
    return { kind: 'reopened', severity };
  }
  if (priorityRank(event.priority) > priorityRank(previous.priority)) {
    return { kind: 'escalated', severity };
  }
  if (event.status === 'ESCALATED' && previous.status !== 'ESCALATED') {
    return { kind: 'escalated', severity };
  }
  return null;
}

export function seenStateOf(
  event: Pick<ActiveEvent, 'status' | 'priority' | 'version' | 'updatedAt'>,
): SeenEventState {
  return {
    status: event.status,
    priority: event.priority,
    version: event.version,
    updatedAt: event.updatedAt,
  };
}

export function alertItemId(eventId: string, kind: AlertKind, at: string): string {
  return `${eventId}:${kind}:${at}:${Math.random().toString(16).slice(2, 8)}`;
}
