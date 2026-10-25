import type { TimelineItem } from '@/types/contract';

export interface KeyTimelineEntry {
  at: string;
  actor: string;
  text: string;
  kind: 'event' | 'task' | 'evidence' | 'assessment';
}

export interface TimelineSummary {
  key: KeyTimelineEntry[];
  aggregated: string[];
}

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

const KEY_TASK_ACTIONS = new Set([
  'task.created', 'task.dispatched', 'task.accepted', 'task.started',
  'task.submitted', 'task.approved', 'task.rejected', 'task.cancelled',
]);

/** 去重相邻完全相同的状态迁移（同事件、同目标状态、同分钟）。 */
function dedupeTransitions(items: TimelineItem[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  let lastKey = '';
  for (const it of items) {
    if (it.actionType !== 'event.status-changed') {
      out.push(it);
      continue;
    }
    const minute = it.occurredAt.slice(0, 16);
    const key = `${it.eventRef}|${it.toStatus}|${minute}`;
    if (key !== lastKey) out.push(it);
    lastKey = key;
  }
  return out;
}

/**
 * 正式报告用的精简时间线：关键节点逐条保留，重复盲区/系统动作统计汇总。
 * 完整 business_events 仍可在网页时间线 Tab 查看。
 */
export function summarizeTimeline(items: TimelineItem[]): TimelineSummary {
  const key: KeyTimelineEntry[] = [];
  let blindOpened = 0;
  let blindResolved = 0;
  const blindReaches = new Set<string>();
  const otherCounts = new Map<string, number>();

  for (const it of dedupeTransitions(items)) {
    const a = it.actionType;
    if (a === 'blindspot.opened') {
      blindOpened += 1;
      it.eventRef && blindReaches.add(it.eventRef);
      continue;
    }
    if (a === 'blindspot.resolved') {
      blindResolved += 1;
      continue;
    }
    if (a === 'event.status-changed') {
      const from = it.fromStatus ? `${EVENT_STATUS_CN[it.fromStatus] ?? it.fromStatus} → ` : '';
      const to = EVENT_STATUS_CN[it.toStatus ?? ''] ?? it.toStatus ?? '';
      key.push({
        at: it.occurredAt,
        actor: it.actor,
        text: `事件状态：${from}${to}${it.description ? `（${it.description}）` : ''}`,
        kind: 'event',
      });
      continue;
    }
    if (KEY_TASK_ACTIONS.has(a)) {
      key.push({
        at: it.occurredAt,
        actor: it.actor,
        text: `${TASK_ACTION_CN[a] ?? a}${it.description ? `：${it.description}` : ''}`,
        kind: 'task',
      });
      continue;
    }
    if (a === 'evidence.added') {
      key.push({ at: it.occurredAt, actor: it.actor, text: it.description || '新增证据', kind: 'evidence' });
      continue;
    }
    if (a === 'assessment.created') {
      key.push({ at: it.occurredAt, actor: it.actor, text: it.description || '再评估', kind: 'assessment' });
      continue;
    }
    otherCounts.set(a, (otherCounts.get(a) ?? 0) + 1);
  }

  // 时间正序
  key.sort((x, y) => x.at.localeCompare(y.at));

  const aggregated: string[] = [];
  if (blindOpened || blindResolved) {
    const reaches = [...blindReaches].join('、') || '—';
    aggregated.push(`监测盲区：开启 ${blindOpened} 次、解除 ${blindResolved} 次（涉及断面：${reaches}），明细见网页完整时间线。`);
  }
  for (const [action, n] of otherCounts) {
    if (n > 0) aggregated.push(`${action}：${n} 条（已汇总）。`);
  }

  return { key, aggregated };
}
