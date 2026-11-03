import type { ReviewBlindSpot, TimelineItem } from '@/types/contract';

export interface BlindSpotAuditTimes {
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  lastResolvedAt: string | null;
}

export interface BlindSpotGroup {
  key: string;
  reachId: string;
  reason: string;
  records: ReviewBlindSpot[];
  total: number;
  unresolved: number;
  resolved: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  lastResolvedAt: string | null;
}

export interface BlindSpotSummary {
  total: number;
  unresolved: number;
  resolved: number;
  groups: BlindSpotGroup[];
}

function earlier(a: string | null, b: string): string {
  return !a || b < a ? b : a;
}

function later(a: string | null, b: string): string {
  return !a || b > a ? b : a;
}

/**
 * 盲区审计时间来自统一时间线，不从盲区快照记录推测时间。
 * 无对应审计事件时保持 null，界面显示“—”。
 */
export function buildBlindSpotSummary(
  records: ReviewBlindSpot[],
  timeline: TimelineItem[],
): BlindSpotSummary {
  const reachIds = [...new Set(records.map((r) => r.reachId))];
  const audit = new Map<string, BlindSpotAuditTimes>();
  for (const item of timeline) {
    if (item.bizType !== 'BLINDSPOT') continue;
    if (item.actionType !== 'blindspot.opened' && item.actionType !== 'blindspot.resolved') continue;
    const reachId = reachIds.find((id) => item.description?.includes(id));
    if (!reachId) continue;
    const current = audit.get(reachId) ?? {
      firstOpenedAt: null,
      lastOpenedAt: null,
      lastResolvedAt: null,
    };
    if (item.actionType === 'blindspot.opened') {
      current.firstOpenedAt = earlier(current.firstOpenedAt, item.occurredAt);
      current.lastOpenedAt = later(current.lastOpenedAt, item.occurredAt);
    } else {
      current.lastResolvedAt = later(current.lastResolvedAt, item.occurredAt);
    }
    audit.set(reachId, current);
  }

  const reachOrder = new Map(reachIds.map((id, index) => [id, index]));
  const groups = new Map<string, BlindSpotGroup>();
  for (const record of records) {
    const reason = record.reason || '未注明盲区类型';
    const key = `${record.reachId}::${reason}`;
    const group = groups.get(key) ?? {
      key,
      reachId: record.reachId,
      reason,
      records: [],
      total: 0,
      unresolved: 0,
      resolved: 0,
      firstOpenedAt: null,
      lastOpenedAt: null,
      lastResolvedAt: null,
    };
    group.records.push(record);
    group.total += 1;
    if (record.resolved) group.resolved += 1;
    else group.unresolved += 1;
    groups.set(key, group);
  }

  const ordered = [...groups.values()]
    .map((group) => {
      const times = audit.get(group.reachId);
      return {
        ...group,
        firstOpenedAt: times?.firstOpenedAt ?? null,
        lastOpenedAt: times?.lastOpenedAt ?? null,
        lastResolvedAt: times?.lastResolvedAt ?? null,
      };
    })
    .sort((a, b) => {
      const byReach = (reachOrder.get(a.reachId) ?? 0) - (reachOrder.get(b.reachId) ?? 0);
      return byReach !== 0 ? byReach : a.reason.localeCompare(b.reason);
    });

  return {
    total: records.length,
    unresolved: records.filter((r) => !r.resolved).length,
    resolved: records.filter((r) => r.resolved).length,
    groups: ordered,
  };
}

/** 统一时间字面值展示，不做时区换算。 */
export function blindSpotTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(5, 16).replace('T', ' ');
}

export function groupStatusText(group: BlindSpotGroup): string {
  if (group.unresolved > 0) return `${group.unresolved} 未消除`;
  return '已解除';
}
