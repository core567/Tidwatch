/**
 * AssessmentAdapter：原项目真实事件/证据/假设/时间线/建议/任务 → 新版研判视觉形状。
 * - 状态分组（五类）仅用于视觉展示，原始八态值始终同时保留显示
 * - RECOVERED 与 UNRESOLVED 明确区分（已恢复 / 无法判定），不统一为成功结案
 * - 所有数据来自真实 API；无数据字段显示空态，不编造
 */
import type {
  ActiveEvent, EventDetail, Evidence, Hypothesis, Recommendation, TimelineItem,
} from '@/types/contract';
import { EVENT_STATUS, reachName } from '@/components/EventBits';
import { simMetricName, simMetricUnitByKey } from '@/lib/metrics';
import { EVENT_STATUS_GROUP, RISK_CODE, RISK_LABEL } from './meta';
import { stationIdOf } from '../overview/overviewAdapter';
import type {
  AssessmentEvent, AssessmentStatus, EvidenceItem, EvidenceType, LinkedTask,
  Suggestion, TimelineStep,
} from './assessmentTypes';
import type { Hypothesis as HypothesisView } from './assessmentTypes';

export { EVENT_STATUS_GROUP };

export function riskOfPriority(priority: string): 'high' | 'medium' | 'low' {
  return priority === 'HIGH' ? 'high' : priority === 'LOW' ? 'low' : 'medium';
}

export function statusGroupOf(status: string): AssessmentStatus {
  return EVENT_STATUS_GROUP[status] ?? '待研判';
}

/** 原始状态中文（八态），与分组同时显示 */
export function originalStatusLabel(status: string): string {
  return `${EVENT_STATUS[status as keyof typeof EVENT_STATUS]?.text ?? status} · ${status}`;
}

/** 业务时间线节点中文映射（技术字段 → 竞赛展示语言） */
export const BIZ_TYPE_CN: Record<string, string> = {
  EVENT: '事件', TASK: '任务', SUBMISSION: '现场提交', REVIEW: '复核',
  ASSESSMENT: '研判', EVIDENCE: '证据', BLINDSPOT: '盲区扫描',
  ATTACHMENT: '附件', RECOVERY: '恢复评估',
};
export const ACTION_CN: Record<string, string> = {
  DETECTED: '异常发现', START_INVESTIGATION: '开始研判', ESCALATE: '升级处置',
  NARROW: '范围收窄', MONITOR: '持续观察', MARK_RECOVERED: '确认恢复',
  MARK_UNRESOLVED: '无法判定', REOPEN: '重新打开', MANUAL_CHECK: '现场核查',
  SUBMIT: '提交反馈', APPROVE: '复核通过', REJECT: '复核退回', CREATE: '创建',
  ACCEPT: '接单', START: '开始执行', CANCEL: '取消',
};

const EVIDENCE_TYPE_MAP: Record<string, EvidenceType> = {
  OBSERVATION: 'sensor',
  RULE: 'metric',
  MANUAL: 'report',
  EXTERNAL: 'report',
  MODEL: 'report',
  KNOWLEDGE: 'report',
};

/** 列表卡片：ActiveEvent → AssessmentEvent（子集） */
export function toQueueEvent(e: ActiveEvent): AssessmentEvent {
  const reachId = e.scopeReachIds[0] ?? 'reach-b';
  const risk = riskOfPriority(e.priority);
  return {
    id: e.eventId,
    title: e.title,
    stationId: stationIdOf(reachId),
    risk,
    status: statusGroupOf(e.status),
    occurredAt: e.firstSeenAt,
    elapsed: `触发于 ${e.firstSeenAt.slice(5, 16).replace('T', ' ')}`,
    location: e.scopeReachIds.map((r) => reachName(r)).join(' → '),
    summary: `类型 ${e.eventType}${e.trigger ? ` · ${e.trigger.metric} ${e.trigger.direction === 'UP' ? '↑' : '↓'}${e.trigger.magnitude}` : ''}`,
    reading: {
      label: e.trigger ? simMetricName(e.trigger.metric) : '事件',
      value: e.trigger ? `${e.trigger.magnitude}` : '—',
      unit: e.trigger ? simMetricUnitByKey(e.trigger.metric) : '',
      delta: e.trigger ? `${e.trigger.direction === 'UP' ? '升高' : e.trigger.direction === 'DOWN' ? '下降' : '变化'} · ${EVENT_STATUS[e.status as keyof typeof EVENT_STATUS]?.text ?? e.status}` : '—',
      tone: e.priority === 'HIGH' ? 'alert' : e.priority === 'NORMAL' ? 'watch' : 'good',
    },
    evidence: [],
    hypotheses: [],
    timeline: [],
    suggestions: [],
    coordinates: '涉及断面见研判工作台',
    riskCode: RISK_CODE[risk],
    riskLabel: RISK_LABEL[risk],
    originalStatus: e.status,
  };
}

/** 工作台：真实 API 数据 → AssessmentEvent（完整形状） */
export function buildCaseEvent(input: {
  detail: EventDetail;
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  timeline: TimelineItem[];
  suggestions: Recommendation[];
  tasks: { taskId: string; title: string; status: string; assignee: string | null; createdAt: string; reachId: string }[];
}): AssessmentEvent {
  const d = input.detail;
  const reachId = d.scopeReachIds[0] ?? 'reach-b';

  const POLARITY_CN: Record<string, string> = { SUPPORT: '支持', COUNTER: '反对', MISSING: '证据缺失' };
  const QUALITY_CN: Record<string, string> = { GOOD: '数据可信', SUSPECT: '数据存疑', INVALID: '数据无效' };
  const evidenceItems: EvidenceItem[] = input.evidence.map((ev, i) => ({
    id: ev.evidenceId,
    type: EVIDENCE_TYPE_MAP[ev.type] ?? 'report',
    title: ev.note ?? `${ev.type} 证据 ${i + 1}`,
    desc: ev.sourceRef || '—',
    time: (ev.observedAt ?? ev.createdAt).slice(5, 16).replace('T', ' '),
    value: `${POLARITY_CN[ev.polarity] ?? ev.polarity}${ev.qualityFlag ? ` · ${QUALITY_CN[ev.qualityFlag] ?? ev.qualityFlag}` : ''}`,
  }));

  const hypotheses: HypothesisView[] = input.hypotheses.map((h, i) => {
    const total = h.supportRefs.length + h.counterRefs.length;
    return {
      title: h.statement,
      confidence: null,
      supportRatio: total ? Math.round((h.supportRefs.length / total) * 100) : null,
      basis: `支持证据 ${h.supportRefs.length} 项 · 反对证据 ${h.counterRefs.length} 项（${HYP_STATE_CN[h.state] ?? h.state}）`,
      selected: i === 0,
    };
  });

  const timeline: TimelineStep[] = input.timeline.map((t) => ({
    time: t.occurredAt.slice(5, 16).replace('T', ' '),
    actor: `${t.actor}${t.actorRole ? ` · ${t.actorRole}` : ''}`,
    action: `${BIZ_TYPE_CN[t.bizType] ?? t.bizType} · ${ACTION_CN[t.actionType] ?? t.actionType}${t.toStatus ? ` → ${EVENT_STATUS[t.toStatus as keyof typeof EVENT_STATUS]?.text ?? t.toStatus}` : ''}`,
    bizType: t.bizType,
    note: t.description ?? '',
    state: 'done' as const,
  }));

  const suggestions: Suggestion[] = input.suggestions.map((s) => ({
    priority: s.priority === 'HIGH' ? '高' : s.priority === 'LOW' ? '低' : '中',
    title: s.title,
    desc: s.reason,
    action: s.eventAction ? `执行 ${s.eventAction}` : s.suggestedTask ? '派发现场核查' : s.category,
  }));

  const task = input.tasks[0];
  const linkedTask: LinkedTask | undefined = task
    ? {
        id: task.taskId,
        title: task.title,
        assignee: task.assignee ?? '未指派',
        status: task.status,
        time: task.createdAt.slice(5, 16).replace('T', ' '),
      }
    : undefined;

  const risk = riskOfPriority(d.priority);
  return {
    id: d.eventId,
    title: d.title,
    stationId: stationIdOf(reachId),
    risk,
    status: statusGroupOf(d.status),
    occurredAt: d.firstSeenAt.slice(5, 16).replace('T', ' '),
    elapsed: `版本 v${d.version} · 更新 ${d.updatedAt.slice(5, 16).replace('T', ' ')}`,
    location: d.scopeReachIds.map((r) => reachName(r)).join(' → '),
    summary: `类型 ${d.eventType}${d.trigger ? ` · ${d.trigger.metric} ${d.trigger.direction === 'UP' ? '↑' : '↓'}${d.trigger.magnitude}` : ''} · 变化 ${d.changeCount} 次`,
    reading: {
      label: d.trigger ? simMetricName(d.trigger.metric) : '事件',
      value: d.trigger ? `${d.trigger.magnitude}` : '—',
      unit: d.trigger ? simMetricUnitByKey(d.trigger.metric) : '',
      delta: d.trigger ? `${d.trigger.direction === 'UP' ? '升高' : d.trigger.direction === 'DOWN' ? '下降' : '变化'} · ${EVENT_STATUS[d.status as keyof typeof EVENT_STATUS]?.text ?? d.status}` : '—',
      tone: d.priority === 'HIGH' ? 'alert' : d.priority === 'NORMAL' ? 'watch' : 'good',
    },
    evidence: evidenceItems,
    hypotheses,
    timeline,
    suggestions,
    linkedTask,
    coordinates: '示意位置',
    riskCode: RISK_CODE[risk],
    riskLabel: RISK_LABEL[risk],
    originalStatus: d.status,
  };
}

const HYP_STATE_CN: Record<string, string> = {
  OPEN: '待验证', PARTIAL_SUPPORT: '部分支持', SUPPORT: '支持', NOT_SUPPORTED: '不支持', UNKNOWN: '未知',
};
