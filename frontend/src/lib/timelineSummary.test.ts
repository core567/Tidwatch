import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeTimeline } from './timelineSummary.ts';
import type { TimelineItem } from '@/types/contract';

function item(partial: Partial<TimelineItem>): TimelineItem {
  return {
    eventId: 'x',
    bizType: 'EVENT',
    actionType: 'event.status-changed',
    eventRef: 'TW-x',
    taskRef: null,
    fromStatus: null,
    toStatus: null,
    description: null,
    actor: 'SYSTEM',
    occurredAt: '2026-10-25T10:00:00+00:00',
    source: 'live',
    evidenceRefs: [],
    ...partial,
  };
}

test('关键节点保留：里程碑状态与任务动作逐条', () => {
  const rows = [
    item({ actionType: 'event.status-changed', toStatus: 'INVESTIGATING', occurredAt: '2026-10-25T10:01:00+00:00' }),
    item({ bizType: 'TASK', actionType: 'task.created', description: '现场核查', occurredAt: '2026-10-25T10:02:00+00:00' }),
    item({ bizType: 'REVIEW', actionType: 'task.approved', occurredAt: '2026-10-25T11:00:00+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERED', occurredAt: '2026-10-25T11:30:00+00:00' }),
  ];
  const { key } = summarizeTimeline(rows);
  assert.equal(key.length, 4);
  assert.match(key[0].text, /研判中/);
  assert.match(key[1].text, /派发现场任务/);
  assert.match(key[2].text, /复核通过/);
  assert.match(key[3].text, /已恢复/);
});

test('中间状态抖动被汇总，只保留里程碑', () => {
  const rows = [
    item({ actionType: 'event.status-changed', toStatus: 'INVESTIGATING', occurredAt: '2026-10-25T10:00:00+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'MONITORING', occurredAt: '2026-10-25T10:01:00+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'NARROWED', occurredAt: '2026-10-25T10:02:00+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'MONITORING', occurredAt: '2026-10-25T10:03:00+00:00' }),
  ];
  const { key, aggregated } = summarizeTimeline(rows);
  // 仅保留首次研判中
  assert.equal(key.length, 1);
  assert.match(aggregated.join(''), /中间状态调整共 3 次/);
});

test('终态只保留最后一次（已恢复后又回到研判中）', () => {
  const rows = [
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERED', occurredAt: '2026-10-25T10:00:00+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'INVESTIGATING', occurredAt: '2026-10-25T11:00:00+00:00' }),
  ];
  const { key } = summarizeTimeline(rows);
  // 第二次研判中视为抖动，仅保留一次（首个）+ 最早暂存终态被后续覆盖；当前数据无最终 RECOVERED
  const texts = key.map((k) => k.text);
  assert.equal(texts.filter((t) => /已恢复/.test(t)).length, 1);
});

test('重复盲区开关被汇总，不逐条铺开', () => {
  const rows = [
    item({ bizType: 'BLINDSPOT', actionType: 'blindspot.opened', eventRef: 'reach-a' }),
    item({ bizType: 'BLINDSPOT', actionType: 'blindspot.opened', eventRef: 'reach-b' }),
    item({ bizType: 'BLINDSPOT', actionType: 'blindspot.resolved', eventRef: 'reach-a' }),
  ];
  const { key, aggregated } = summarizeTimeline(rows);
  assert.equal(key.length, 0);
  const line = aggregated.join('');
  assert.match(line, /开启 2 次/);
  assert.match(line, /解除 1 次/);
  assert.match(line, /reach-a/);
});

test('终态在报告中只呈现最后一次（演练反复时不刷屏）', () => {
  const rows = [
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERED', occurredAt: '2026-10-25T10:00:10+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERED', occurredAt: '2026-10-25T10:05:00+00:00' }),
  ];
  const { key } = summarizeTimeline(rows);
  assert.equal(key.length, 1);
  assert.match(key[0].text, /已恢复/);
});

test('升级为关键里程碑会逐条保留', () => {
  const rows = [
    item({ actionType: 'event.status-changed', toStatus: 'INVESTIGATING', occurredAt: '2026-10-25T10:00:00+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'ESCALATED', occurredAt: '2026-10-25T10:10:00+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERY_PENDING', occurredAt: '2026-10-25T11:00:00+00:00' }),
  ];
  const { key } = summarizeTimeline(rows);
  assert.equal(key.length, 3);
});

test('空时间线', () => {
  const r = summarizeTimeline([]);
  assert.deepEqual(r.key, []);
  assert.deepEqual(r.aggregated, []);
});
