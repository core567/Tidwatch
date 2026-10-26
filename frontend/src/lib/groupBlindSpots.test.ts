import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupBlindSpots } from './groupBlindSpots.ts';
import type { ReviewBlindSpot, TimelineItem } from '@/types/contract';

function bs(reachId: string, resolved: boolean, reason = '数据链路中断（LWT 离线）'): ReviewBlindSpot {
  return { reachId, resolved, reason, impact: 'x' };
}
function tl(actionType: 'blindspot.opened' | 'blindspot.resolved', reach: string, at: string): TimelineItem {
  return {
    eventId: 'x',
    bizType: 'BLINDSPOT',
    actionType,
    eventRef: 'TW-x',
    taskRef: null,
    fromStatus: null,
    toStatus: null,
    description: `${reach} 监测盲区${actionType === 'blindspot.opened' ? '开启' : '解除'}`,
    actor: 'SYSTEM',
    occurredAt: at,
    source: 'live',
    evidenceRefs: [],
  };
}

test('同断面同原因已解除记录汇总为次数与时间范围', () => {
  const review = [bs('reach-a', true), bs('reach-a', true), bs('reach-a', true)];
  const timeline = [
    tl('blindspot.opened', 'reach-a', '2026-10-25T10:00:00+00:00'),
    tl('blindspot.opened', 'reach-a', '2026-10-25T11:00:00+00:00'),
    tl('blindspot.resolved', 'reach-a', '2026-10-25T10:10:00+00:00'),
    tl('blindspot.resolved', 'reach-a', '2026-10-25T11:10:00+00:00'),
  ];
  const g = groupBlindSpots(review, timeline);
  assert.equal(g.length, 1);
  assert.equal(g[0].count, 3);
  assert.equal(g[0].resolved, true);
  assert.ok(g[0].firstStart?.includes('10:00'));
  assert.ok(g[0].lastEnd?.includes('11:10'));
});

test('不同断面/原因/未解除分别成组，未解除排最前', () => {
  const review = [
    bs('reach-a', true),
    bs('reach-b', true),
    bs('reach-a', false),
    bs('reach-a', false, '其他原因'),
  ];
  const g = groupBlindSpots(review, []);
  // 未解除两组在前（按断面排序），已解除在后
  assert.equal(g.length, 4);
  assert.equal(g[0].resolved, false);
  assert.equal(g[g.length - 1].resolved, true);
  const reasons = new Set(g.map((x) => x.reason));
  assert.ok(reasons.size >= 2);
});

test('空数据与无时间线安全处理', () => {
  assert.deepEqual(groupBlindSpots(undefined, []), []);
  const g = groupBlindSpots([bs('reach-c', false)], []);
  assert.equal(g[0].firstStart, null);
  assert.equal(g[0].lastEnd, null);
});
