// 时间线里程碑提炼测试
import { test } from 'node:test';
import assert = require('node:assert/strict');
import { digestTimeline } from '../utils/timelineDigest';

const t = (min: number) => `2026-10-25T10:${String(min).padStart(2, '0')}:00`;
const ev = (over: Record<string, unknown> = {}) => ({
  actionType: 'event.status-changed',
  actor: 'SYSTEM',
  occurredAt: t(0),
  eventRef: 'TW-002',
  ...over,
});

test('盲区开关被汇总不逐条入里程碑', () => {
  const items = Array.from({ length: 20 }, (_, i) =>
    ev({ actionType: i % 2 ? 'blindspot.resolved' : 'blindspot.opened', occurredAt: t(i) }),
  );
  const d = digestTimeline(items);
  assert.equal(d.milestones.length, 0);
  assert.equal(d.blindOpened, 10);
  assert.equal(d.blindResolved, 10);
});

test('关键事件状态入里程碑，中间态计入抖动，研判中只取首次', () => {
  const items = [
    ev({ toStatus: 'OPEN', occurredAt: t(0) }),
    ev({ toStatus: 'INVESTIGATING', occurredAt: t(1) }),
    ev({ toStatus: 'MONITORING', occurredAt: t(2) }),
    ev({ toStatus: 'NARROWED', occurredAt: t(3) }),
    ev({ toStatus: 'INVESTIGATING', occurredAt: t(4) }), // 重复研判 -> 抖动
    ev({ toStatus: 'ESCALATED', occurredAt: t(5) }),
  ];
  const d = digestTimeline(items);
  assert.deepEqual(
    d.milestones.map((m) => m.text),
    ['事件状态：研判中', '事件状态：已升级'],
  );
  assert.ok(d.transitionFlapping >= 3);
});

test('终态只保留最后一次并置于末尾', () => {
  const items = [
    ev({ toStatus: 'INVESTIGATING', occurredAt: t(1) }),
    ev({ toStatus: 'RECOVERED', occurredAt: t(2) }),
    ev({ toStatus: 'INVESTIGATING', occurredAt: t(3) }),
    ev({ toStatus: 'UNRESOLVED', occurredAt: t(4) }),
  ];
  const d = digestTimeline(items);
  assert.equal(d.milestones[d.milestones.length - 1].text, '事件状态：无法判定');
  assert.equal(d.milestones.filter((m) => /已恢复|无法判定/.test(m.text)).length, 1);
});

test('任务动作按类型打标（提交/复核）', () => {
  const items = [
    ev({ actionType: 'task.created', actor: 'u-admin', occurredAt: t(1) }),
    ev({ actionType: 'task.submitted', actor: 'u-admin', occurredAt: t(2) }),
    ev({ actionType: 'task.rejected', actor: 'u-admin', occurredAt: t(3) }),
  ];
  const d = digestTimeline(items);
  assert.deepEqual(d.milestones.map((m) => m.kind), ['task', 'submission', 'review']);
});

test('空时间线安全返回', () => {
  const d = digestTimeline([]);
  assert.deepEqual(d.milestones, []);
  assert.equal(d.blindOpened, 0);
});
