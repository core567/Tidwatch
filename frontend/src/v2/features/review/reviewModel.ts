import { EVENT_STATUS, reachName } from '@/components/EventBits';
import { simMetricName, simMetricUnitByKey } from '@/lib/metrics';
import type {
  EventDetail,
  EventReviewDetail,
  EventStatus,
  Observation,
  RecoveryAssessment,
  RecoveryFactor,
  StatusTransition,
  TimelineItem,
} from '@/types/contract';
import type { ChartWindow } from './useEventDossier';
import { timeMs } from './useEventDossier';

export type RiskTone = 'high' | 'medium' | 'low';

export const PRIORITY_META = {
  HIGH: { code: 'R3', label: '高风险', tone: 'high' as const },
  NORMAL: { code: 'R2', label: '中风险', tone: 'medium' as const },
  LOW: { code: 'R1', label: '低风险', tone: 'low' as const },
};

export function priorityMetaSafe(priority: EventDetail['priority'] | undefined) {
  const meta = PRIORITY_META[priority ?? 'NORMAL'] ?? PRIORITY_META.NORMAL;
  const badge = meta.tone === 'high' ? ('high' as const) : meta.tone === 'medium' ? ('mid' as const) : ('default' as const);
  return { ...meta, badge };
}

export function statusTone(status: EventStatus): 'live' | 'high' | 'mid' | 'default' {
  if (status === 'RECOVERED') return 'live';
  if (status === 'UNRESOLVED' || status === 'ESCALATED') return 'high';
  if (status === 'OPEN' || status === 'INVESTIGATING' || status === 'RECOVERY_PENDING') return 'mid';
  return 'default';
}

export function riskOfStatus(status: string): RiskTone {
  if (status === 'OPEN' || status === 'ESCALATED' || status === 'UNRESOLVED') return 'high';
  if (status === 'RECOVERED') return 'low';
  return 'medium';
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const text = iso.slice(11, 16);
  return text || '—';
}

/** 统一按后端存储的时间字面值展示：去掉时区后缀，不做时区换算。 */
export function displayIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const naive = iso.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  const [date, time] = naive.split('T');
  if (!date || !time) return iso;
  return `${date.replace(/-/g, '/')} ${time.slice(0, 8)}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(5, 10);
}

export function clockRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '—';
  return `${shortDate(start)} ${clock(start)} → ${shortDate(end)} ${clock(end)}`;
}

export function durationText(assess: RecoveryAssessment | undefined, event: EventDetail | undefined): string {
  const start = timeMs(event?.firstSeenAt);
  const anchor = timeMs(assess?.anchor.at);
  if (!Number.isFinite(start) || !Number.isFinite(anchor) || anchor < start) return '—';
  const minutes = Math.round((anchor - start) / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

export function metricLabel(metric: string | undefined): string {
  return metric ? simMetricName(metric) : '触发指标';
}

export function metricUnit(window: ChartWindow | null, observations: Observation[]): string {
  return window?.unit || observations[0]?.unit || '';
}

export function summaryText(event: EventDetail, review: EventReviewDetail): string {
  const trigger = event.trigger;
  const metric = metricLabel(trigger?.metric);
  const direction =
    trigger?.direction === 'DOWN' ? '下降' : trigger?.direction === 'LEVEL' ? '持续偏离' : '上升';
  const scope = event.scopeReachIds.map(reachName).join('、') || '—';
  const status = EVENT_STATUS[event.status]?.text ?? event.status;
  return `${scope} 的${metric}出现${direction}异常，由规则 ${trigger?.ruleId ?? '—'} 识别，触发幅度 ${trigger?.magnitude ?? '—'}。当前状态「${status}」，关联 ${review.tasks.length} 项现场任务、${review.supportingEvidence.length + review.counterEvidence.length} 条证据。`;
}

export interface RiskPoint {
  time: string;
  risk: RiskTone;
  label: string;
  status: string;
}

const STATUS_SHORT: Record<string, string> = {
  OPEN: '待初查',
  INVESTIGATING: '研判中',
  MONITORING: '观察中',
  ESCALATED: '已升级',
  NARROWED: '收窄',
  RECOVERY_PENDING: '待恢复',
  RECOVERED: '已恢复',
  UNRESOLVED: '未判定',
};

/**
 * 状态迁移 → 风险轨。
 * 演示脚本会在数秒内反复翻转状态；这里按「首次进入某状态」取点，保留完整真实轨迹。
 */
export function buildRiskPoints(
  transitions: StatusTransition[],
  current: EventStatus | undefined,
  updatedAt: string | null | undefined,
): RiskPoint[] {
  const sorted = [...transitions].sort((a, b) => timeMs(a.createdAt) - timeMs(b.createdAt));
  const firstByStatus = new Map<string, StatusTransition>();
  for (const t of sorted) {
    if (!firstByStatus.has(t.toStatus)) firstByStatus.set(t.toStatus, t);
  }
  const points: RiskPoint[] = [...firstByStatus.values()]
    .sort((a, b) => timeMs(a.createdAt) - timeMs(b.createdAt))
    .map((t) => ({
      time: clock(t.createdAt),
      risk: riskOfStatus(t.toStatus),
      label: STATUS_SHORT[t.toStatus] ?? t.toStatus,
      status: t.toStatus,
    }));

  if (current) {
    const last = points[points.length - 1];
    if (!last || last.status !== current) {
      points.push({
        time: clock(updatedAt),
        risk: riskOfStatus(current),
        label: STATUS_SHORT[current] ?? current,
        status: current,
      });
    }
  }
  if (points.length <= 7) return points;
  return [...points.slice(0, 4), ...points.slice(-3)];
}

export const ACTION_CN: Record<string, string> = {
  'task.created': '创建现场任务',
  'task.dispatched': '派发现场任务',
  'task.accepted': '任务接收',
  'task.started': '开始现场核查',
  'task.submitted': '提交现场记录',
  'task.cancelled': '任务取消',
  'task.approved': '复核通过',
  'task.rejected': '复核退回',
  'evidence.added': '登记证据',
  'assessment.created': '触发再评估',
  'blindspot.opened': '监测盲区开启',
  'blindspot.resolved': '监测盲区解除',
  'attachment.uploaded': '上传现场照片',
  'recovery.assessed': '恢复评估',
  'event.status-changed': '事件状态迁移',
};

const DISPOSAL_TYPES = new Set(['TASK', 'SUBMISSION', 'REVIEW', 'EVIDENCE', 'ASSESSMENT', 'RECOVERY']);

export interface DisposalAction {
  key: string;
  time: string;
  occurredAt: string;
  actor: string;
  action: string;
  note: string;
  business: string;
}

/** 处置过程：只取人工/系统业务动作，去掉重复镜像记录与高频盲区扫描。 */
export function buildDisposalActions(timeline: TimelineItem[]): DisposalAction[] {
  const seen = new Set<string>();
  const out: DisposalAction[] = [];
  for (const item of timeline) {
    if (!DISPOSAL_TYPES.has(item.bizType)) continue;
    const key = [
      item.actionType,
      item.taskRef ?? '',
      item.submissionRef ?? '',
      item.description ?? '',
      item.occurredAt.slice(0, 16),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      time: clock(item.occurredAt),
      occurredAt: item.occurredAt,
      actor: item.actor,
      action: ACTION_CN[item.actionType] ?? item.actionType,
      note: item.description ?? '',
      business: item.bizType,
    });
  }
  return out.sort((a, b) => timeMs(a.occurredAt) - timeMs(b.occurredAt));
}

export interface AttachmentRef {
  id: string;
  taskTitle: string;
  version: number;
  submittedAt: string;
}

export function collectAttachments(review: EventReviewDetail | undefined): AttachmentRef[] {
  if (!review) return [];
  return review.tasks.flatMap((task) =>
    task.submissions.flatMap((sub) =>
      sub.attachmentIds.map((id) => ({
        id,
        taskTitle: task.title,
        version: sub.version,
        submittedAt: sub.submittedAt,
      })),
    ),
  );
}

export const BIZ_TYPE_CN: Record<string, string> = {
  EVENT: '事件',
  TASK: '任务',
  SUBMISSION: '现场提交',
  REVIEW: '复核',
  ASSESSMENT: '研判',
  EVIDENCE: '证据',
  BLINDSPOT: '盲区扫描',
  ATTACHMENT: '附件',
  RECOVERY: '恢复评估',
};

export const EVIDENCE_TYPE_CN: Record<string, string> = {
  OBSERVATION: '观测证据',
  MANUAL: '人工证据',
  RULE: '规则证据',
  EXTERNAL: '外部证据',
  MODEL: '模型推断',
  KNOWLEDGE: '知识库',
};

export const FACTOR_CN: Record<string, string> = {
  F1_ANCHOR: '复核锚点可用',
  F2_OBSERVATION_RETURN: '观测回到基线',
  F3_SAMPLE_QUALITY: '样本质量充足',
  F4_REVIEW_CLOSED: '现场复核已闭环',
  F5_NO_OPEN_BLINDSPOT: '无未消除盲区',
  F6_FIELD_EVIDENCE: '现场证据充分',
  F7_PERSISTENCE: '越限持续性检查',
  EVENT_RECOVERED: '事件已标记恢复',
  OBSERVATION_STABLE: '观测恢复稳定',
  NO_NEW_ANOMALY: '无新增异常',
  TASK_APPROVED: '处置任务已复核',
  TIME_SINCE_LAST_CHANGE: '距末次变化时长',
  BLINDSPOT_RESOLVED: '监测盲区已解除',
};

export function factorSorted(factors: RecoveryFactor[]): RecoveryFactor[] {
  const rank = (v: boolean | null) => (v === false ? 0 : v === null ? 1 : 2);
  return [...factors].sort((a, b) => rank(a.passed) - rank(b.passed));
}

export function peakInWindow(observations: Observation[], window: ChartWindow | null): number | null {
  if (!window?.start || !window.end) return null;
  const start = timeMs(window.start);
  const end = timeMs(window.end);
  const values = observations
    .filter((o) => {
      const t = timeMs(o.observedAt);
      return o.qualityFlag === 'GOOD' && t >= start && t <= end;
    })
    .map((o) => o.value)
    .filter((v) => Number.isFinite(v));
  return values.length ? Math.max(...values) : null;
}

export function unitForMetric(metric: string | undefined, fallback = ''): string {
  return metric ? simMetricUnitByKey(metric) || fallback : fallback;
}
