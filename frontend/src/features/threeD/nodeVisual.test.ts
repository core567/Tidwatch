import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNodeVisualMap } from './nodeVisual.ts';

const online = [
  { reachId: 'reach-a', onlineStatus: 'ONLINE' },
  { reachId: 'reach-b', onlineStatus: 'ONLINE' },
  { reachId: 'reach-c', onlineStatus: 'ONLINE' },
];

function event(eventId: string, status: string, scopeReachIds: string[]) {
  return { eventId, title: eventId, status, scopeReachIds };
}

test('三节点正常：无异常特效', () => {
  const map = buildNodeVisualMap(online, []);
  assert.equal(map['reach-a'].tier, 'normal');
  assert.equal(map['reach-b'].tier, 'normal');
  assert.equal(map['reach-c'].tier, 'normal');
});

test('仅 A 异常', () => {
  const map = buildNodeVisualMap(online, [event('TW-001', 'INVESTIGATING', ['reach-a'])]);
  assert.equal(map['reach-a'].tier, 'abnormal');
  assert.equal(map['reach-b'].tier, 'normal');
  assert.equal(map['reach-c'].tier, 'normal');
});

test('仅 B 异常', () => {
  const map = buildNodeVisualMap(online, [event('TW-001', 'OPEN', ['reach-b'])]);
  assert.equal(map['reach-a'].tier, 'normal');
  assert.equal(map['reach-b'].tier, 'abnormal');
  assert.equal(map['reach-c'].tier, 'normal');
});

test('A、B 同时异常', () => {
  const map = buildNodeVisualMap(online, [
    event('TW-001', 'INVESTIGATING', ['reach-a']),
    event('TW-002', 'MONITORING', ['reach-b']),
  ]);
  assert.equal(map['reach-a'].tier, 'abnormal');
  assert.equal(map['reach-b'].tier, 'abnormal');
  assert.equal(map['reach-c'].tier, 'normal');
});

test('RECOVERY_PENDING 映射为恢复观察', () => {
  const map = buildNodeVisualMap(online, [event('TW-001', 'RECOVERY_PENDING', ['reach-a'])]);
  assert.equal(map['reach-a'].tier, 'recovery');
});

test('离线节点不显示为正常', () => {
  const map = buildNodeVisualMap([
    { reachId: 'reach-a', onlineStatus: 'OFFLINE' },
    { reachId: 'reach-b', onlineStatus: 'STALE' },
    { reachId: 'reach-c', onlineStatus: 'ONLINE' },
  ], []);
  assert.equal(map['reach-a'].tier, 'offline');
  assert.equal(map['reach-a'].offline, true);
  assert.equal(map['reach-b'].tier, 'watch');
  assert.equal(map['reach-c'].tier, 'normal');
});

test('离线且异常：主色仍为异常，同时保留离线标记', () => {
  const map = buildNodeVisualMap(
    [{ reachId: 'reach-a', onlineStatus: 'OFFLINE' }],
    [event('TW-001', 'INVESTIGATING', ['reach-a'])],
  );
  assert.equal(map['reach-a'].tier, 'abnormal');
  assert.equal(map['reach-a'].offline, true);
});

test('未知链路状态不显示为正常', () => {
  const map = buildNodeVisualMap([{ reachId: 'reach-a', onlineStatus: 'UNKNOWN' }], []);
  assert.equal(map['reach-a'].tier, 'offline');
  assert.equal(map['reach-a'].offline, true);
});

test('异常优先于恢复观察', () => {
  const map = buildNodeVisualMap(online, [
    event('TW-001', 'RECOVERY_PENDING', ['reach-a']),
    event('TW-002', 'INVESTIGATING', ['reach-a']),
  ]);
  assert.equal(map['reach-a'].tier, 'abnormal');
});
