// 事件时间线里程碑提炼（移植并精简自 PC timelineSummary.ts）
// 全量 business_events 中盲区开关/状态抖动很多（实测单事件可达数百条），
// 现场页只逐条呈现关键节点，盲区与抖动做汇总，不逐条刷屏。

const EVENT_STATUS_CN: Record<string, string> = {
  OPEN: '待初查',
  INVESTIGATING: '研判中',
  MONITORING: '持续观察',
  NARROWED: '范围收窄',
  ESCALATED: '已升级',
  RECOVERY_PENDING: '待确认恢复',
  RECOVERED: '已恢复',
  UNRESOLVED: '无法判定',
};

const TASK_ACTION_CN: Record<string, string> = {
  'task.drafted': '创建任务草稿',
  'task.created': '派发现场任务',
  'task.dispatched': '任务正式派发',
  'task.accepted': '现场接收任务',
  'task.started': '开始现场执行',
  'task.submitted': '现场提交反馈',
  'task.approved': 'PC 复核通过',
  'task.rejected': '复核退回补充',
  'task.cancelled': '任务取消',
};

export type MilestoneKind = 'event' | 'task' | 'submission' | 'review' | 'assessment';

export interface Milestone {
  at: string;
  actor: string;
  text: string;
  kind: MilestoneKind;
}

export interface TimelineDigest {
  milestones: Milestone[];
  blindOpened: number;
  blindResolved: number;
  transitionFlapping: number;
}

const KEY_TASK_ACTIONS = new Set([
  'task.created',
  'task.dispatched',
  'task.accepted',
  'task.started',
  'task.submitted',
  'task.approved',
  'task.rejected',
  'task.cancelled',
]);

const MILESTONE_STATUS = new Set([
  'INVESTIGATING',
  'ESCALATED',
  'RECOVERY_PENDING',
  'RECOVERED',
  'UNRESOLVED',
]);
const TERMINAL_STATUS = new Set(['RECOVERED', 'UNRESOLVED']);

interface RawItem {
  actionType: string;
  actor?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  description?: string | null;
  occurredAt: string;
  eventRef?: string | null;
}

/** 同事件、同目标状态、同分钟的相邻迁移只保留一条 */
function dedupeTransitions(items: RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  let lastKey = '';
  for (const it of items) {
    if (it.actionType !== 'event.status-changed') {
      out.push(it);
      continue;
    }
    const minute = it.occurredAt.slice(0, 16);
    const key = `${it.eventRef ?? ''}|${it.toStatus ?? ''}|${minute}`;
    if (key !== lastKey) out.push(it);
    lastKey = key;
  }
  return out;
}

export function digestTimeline(items: RawItem[]): TimelineDigest {
  const sorted = [...items].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  const milestones: Milestone[] = [];
  let blindOpened = 0;
  let blindResolved = 0;
  let transitionFlapping = 0;
  let sawInvestigating = false;
  let lastTerminal: RawItem | null = null;
  let lastTerminalText = '';

  for (const it of dedupeTransitions(sorted)) {
    const a = it.actionType;
    if (a === 'blindspot.opened') {
      blindOpened += 1;
      continue;
    }
    if (a === 'blindspot.resolved') {
      blindResolved += 1;
      continue;
    }
    if (a === 'event.status-changed') {
      const to = it.toStatus ?? '';
      if (TERMINAL_STATUS.has(to)) {
        lastTerminal = it;
        lastTerminalText = EVENT_STATUS_CN[to] ?? to;
        continue;
      }
      if (to === 'INVESTIGATING') {
        if (sawInvestigating) {
          transitionFlapping += 1;
          continue;
        }
        sawInvestigating = true;
      }
      if (!MILESTONE_STATUS.has(to)) {
        transitionFlapping += 1;
        continue;
      }
      const from = it.fromStatus ? `${EVENT_STATUS_CN[it.fromStatus] ?? it.fromStatus} → ` : '';
      milestones.push({
        at: it.occurredAt,
        actor: it.actor ?? 'SYSTEM',
        text: `事件状态：${from}${EVENT_STATUS_CN[to] ?? to}`,
        kind: 'event',
      });
      continue;
    }
    if (KEY_TASK_ACTIONS.has(a)) {
      let kind: MilestoneKind = 'task';
      if (a === 'task.submitted') kind = 'submission';
      if (a === 'task.approved' || a === 'task.rejected') kind = 'review';
      milestones.push({
        at: it.occurredAt,
        actor: it.actor ?? 'SYSTEM',
        text: TASK_ACTION_CN[a] ?? a,
        kind,
      });
      continue;
    }
    if (a === 'assessment.created') {
      milestones.push({
        at: it.occurredAt,
        actor: it.actor ?? 'RULE',
        text: '生成研判结论',
        kind: 'assessment',
      });
    }
  }

  // 终态放在最后（演练中可能出现 已恢复→研判中 的反复）
  if (lastTerminal) {
    milestones.push({
      at: lastTerminal.occurredAt,
      actor: lastTerminal.actor ?? 'SYSTEM',
      text: `事件状态：${lastTerminalText}`,
      kind: 'event',
    });
  }

  return { milestones, blindOpened, blindResolved, transitionFlapping };
}
