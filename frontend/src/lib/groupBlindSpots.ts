import type { ReviewBlindSpot, TimelineItem } from '@/types/contract';

export interface BlindspotGroup {
  reachId: string;
  reason: string;
  resolved: boolean;
  count: number;
  firstStart: string | null;
  lastEnd: string | null;
  impact: string | null;
}

const REACH_FROM_DESC = /(reach-[abc])/;

/**
 * 把重复盲区记录按 断面 + 原因 + 最终状态 分组汇总：
 * 同组给出发生次数与时间范围（取自 business_events 盲区开闭时间）；
 * 不同断面/原因/未解除的记录分别成组，未解除项保留为需要关注的问题。
 */
export function groupBlindSpots(
  reviewSpots: ReviewBlindSpot[] | undefined,
  timeline: TimelineItem[],
): BlindspotGroup[] {
  const groups = new Map<string, BlindspotGroup>();

  // 先按 断面+原因+resolved 聚合 review payload
  for (const s of reviewSpots ?? []) {
    const key = `${s.reachId}|${s.reason}|${s.resolved}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
    } else {
      groups.set(key, {
        reachId: s.reachId,
        reason: s.reason,
        resolved: s.resolved,
        count: 1,
        firstStart: null,
        lastEnd: null,
        impact: s.impact ?? null,
      });
    }
  }

  // 从 business_events 盲区开闭记录补时间范围（description 内含 reach-x）
  const byReach = new Map<string, { opens: string[]; resolves: string[] }>();
  for (const it of timeline) {
    if (it.actionType !== 'blindspot.opened' && it.actionType !== 'blindspot.resolved') continue;
    const m = (it.description || '').match(REACH_FROM_DESC);
    if (!m) continue;
    const reach = m[1];
    const bucket = byReach.get(reach) ?? { opens: [], resolves: [] };
    if (it.actionType === 'blindspot.opened') bucket.opens.push(it.occurredAt);
    else bucket.resolves.push(it.occurredAt);
    byReach.set(reach, bucket);
  }

  const cmp = (a: string, b: string) => a.localeCompare(b);
  for (const g of groups.values()) {
    const t = byReach.get(g.reachId);
    if (t) {
      g.firstStart = t.opens.length ? [...t.opens].sort(cmp)[0] : null;
      g.lastEnd = t.resolves.length ? [...t.resolves].sort(cmp).at(-1) ?? null : null;
    }
  }

  // 未解除排最前，其余按断面
  return [...groups.values()].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return a.reachId.localeCompare(b.reachId);
  });
}
