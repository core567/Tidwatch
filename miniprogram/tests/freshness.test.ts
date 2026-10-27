// 数据新鲜度纯展示函数测试
import { test } from 'node:test';
import assert = require('node:assert/strict');
import { ageMinutes, freshness, relativeText } from '../utils/freshness';

const NOW = new Date('2026-10-27T12:00:00+08:00').getTime();

test('年龄分钟计算与非法输入', () => {
  assert.equal(ageMinutes('2026-10-27T11:00:00+08:00', NOW), 60);
  assert.equal(ageMinutes(null, NOW), null);
  assert.equal(ageMinutes('not-a-date', NOW), null);
  // 迟到的未来时间不出现负数
  assert.equal(ageMinutes('2026-10-27T13:00:00+08:00', NOW), 0);
});

test('三档新鲜度阈值仅用于展示', () => {
  assert.equal(freshness('2026-10-27T11:50:00+08:00', NOW)?.level, 'fresh');
  assert.equal(freshness('2026-10-27T09:00:00+08:00', NOW)?.level, 'stale');
  assert.equal(freshness('2026-10-25T12:00:00+08:00', NOW)?.level, 'old');
  assert.equal(freshness(null, NOW), null);
});

test('相对时间文案', () => {
  assert.equal(relativeText(0), '刚刚');
  assert.equal(relativeText(30), '30 分钟前');
  assert.equal(relativeText(125), '2 小时前');
  assert.equal(relativeText(60 * 24 * 2 + 5), '2 天前');
});
