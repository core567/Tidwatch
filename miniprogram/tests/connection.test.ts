import { test } from 'node:test';
import assert = require('node:assert/strict');
import { connectionTone, CONNECTION_TEXT, ThrottledRunner } from '../utils/connection';

const NOW = new Date('2026-10-28T10:00:00').getTime();

test('WS 断开 -> offline（即使数据较新）', () => {
  assert.equal(connectionTone({ wsOpen: false, lastRefreshFailed: false, dataUpdatedAt: NOW - 1000, now: NOW }), 'offline');
});

test('静默刷新失败 -> offline（旧数据仍展示但要提醒）', () => {
  assert.equal(connectionTone({ wsOpen: true, lastRefreshFailed: true, dataUpdatedAt: NOW - 1000, now: NOW }), 'offline');
});

test('连接正常但数据超过 30 分钟 -> stale', () => {
  const old = NOW - 31 * 60 * 1000;
  assert.equal(connectionTone({ wsOpen: true, lastRefreshFailed: false, dataUpdatedAt: old, now: NOW }), 'stale');
});

test('连接正常且数据新鲜 -> ok', () => {
  assert.equal(connectionTone({ wsOpen: true, lastRefreshFailed: false, dataUpdatedAt: NOW - 60000, now: NOW }), 'ok');
  assert.equal(CONNECTION_TEXT.ok, '实时已连接');
});

test('无数据时间戳时不因新鲜度误报', () => {
  assert.equal(connectionTone({ wsOpen: true, lastRefreshFailed: false, dataUpdatedAt: null, now: NOW }), 'ok');
});

test('ThrottledRunner：多次 schedule 在间隔内只执行一次', async () => {
  let n = 0;
  const r = new ThrottledRunner(() => (n += 1), 30);
  r.schedule();
  r.schedule();
  r.schedule();
  await new Promise((res) => setTimeout(res, 80));
  assert.equal(n, 1);
  r.cancel();
});

test('ThrottledRunner：cancel 后不执行', async () => {
  let n = 0;
  const r = new ThrottledRunner(() => (n += 1), 30);
  r.schedule();
  r.cancel();
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(n, 0);
});
