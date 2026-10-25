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

test('关键节点保留：状态迁移与任务动作逐条', () => {
  const rows = [
    item({ actionType: 'event.status-changed', toStatus: 'INVESTIGATING', occurredAt: '2026-10-25T10:01:00+00:00' }),
    item({ bizType: 'TASK', actionType: 'task.created', description: '现场核查', occurredAt: '2026-10-25T10:02:00+00:00' }),
    item({ bizType: 'REVIEW', actionType: 'task.approved', occurredAt: '2026-10-25T11:00:00+00:00' }),
  ];
  const { key } = summarizeTimeline(rows);
  assert.equal(key.length, 3);
  assert.match(key[0].text, /研判中/);
  assert.match(key[1].text, /派发现场任务/);
  assert.match(key[2].text, /复核通过/);
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

test('相邻重复状态迁移去重', () => {
  const rows = [
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERED', occurredAt: '2026-10-25T10:00:10+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERED', occurredAt: '2026-10-25T10:00:40+00:00' }),
    item({ actionType: 'event.status-changed', toStatus: 'RECOVERED', occurredAt: '2026-10-25T10:05:00+00:00' }),
  ];
  const { key } = summarizeTimeline(rows);
  // 前两条同分钟去重，第三条跨分钟保留
  assert.equal(key.length, 2);
});

test('空时间线', () => {
  const r = summarizeTimeline([]);
  assert.deepEqual(r.key, []);
  assert.deepEqual(r.aggregated, []);
});
