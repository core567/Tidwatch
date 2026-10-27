// 趋势图纯函数测试（含真实库数据形态：51ms 突发 + 1 分钟连续 + 跨场景大间隔）
import { test } from 'node:test';
import assert = require('node:assert/strict');
import {
  normalizePoints,
  buildSegments,
  valueRange,
  yTicks,
  xTicks,
  filterByWindow,
  HOUR_MS,
  type SparkPoint,
} from '../utils/sparkline';

const iso = (ms: number) => new Date(ms).toISOString();
const T0 = new Date('2026-10-25T10:00:00').getTime();

test('normalize：去重同毫秒、丢弃非法值、升序', () => {
  const raw: SparkPoint[] = [
    { t: iso(T0 + 2000), v: 2 },
    { t: iso(T0), v: 1 },
    { t: iso(T0), v: 9 }, // 同毫秒覆盖
    { t: iso(T0 + 1000), v: Number.NaN }, // 丢弃
    { t: 'bad', v: 3 }, // 丢弃
  ];
  const pts = normalizePoints(raw);
  assert.deepEqual(pts.map((p) => p.v), [9, 2]);
});

test('真实间隔形态：51ms 突发段 + 1 分钟段被正确分开（不挤右侧）', () => {
  const times: number[] = [];
  for (let i = 0; i < 30; i++) times.push(new Date('2026-10-25T14:12:28').getTime() + i * 51);
  for (let i = 0; i < 16; i++) times.push(new Date('2026-10-25T15:00:07').getTime() + i * 60000);
  for (let i = 0; i < 25; i++) times.push(new Date('2026-10-25T18:36:59').getTime() + i * 60000);
  times.push(new Date('2026-10-24T10:05:00').getTime());
  const pts = times.map((t) => ({ t: iso(t), v: 5 }));
  const segs = buildSegments(pts);
  // 单点(10-24) + 三个连续段
  assert.equal(segs.length, 4);
  assert.deepEqual(segs.map((s) => s.end - s.start + 1), [1, 30, 16, 25]);
});

test('小间隔抖动不被误断；大间隔断线且不插值', () => {
  const pts: SparkPoint[] = Array.from({ length: 12 }, (_, i) => ({
    t: iso(T0 + i * 60000),
    v: i,
  }));
  // 中间插入 2 小时缺测
  pts.push({ t: iso(T0 + 12 * 60000 + 2 * 3600 * 1000), v: 12 });
  const segs = buildSegments(pts);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[1], { start: 12, end: 12 });
});

test('空序列与单点', () => {
  assert.deepEqual(buildSegments([]), []);
  assert.deepEqual(buildSegments([{ t: iso(T0), v: 1 }]), [{ start: 0, end: 0 }]);
});

test('valueRange：恒定值不零高、有 padding', () => {
  const r = valueRange([{ t: iso(T0), v: 5 }, { t: iso(T0 + 60000), v: 5 }]);
  assert.ok(r.min < 5 && r.max > 5);
  assert.equal(valueRange([]).max - valueRange([]).min, 1);
});

test('yTicks：数量正确、单调、格式随量级', () => {
  const t1 = yTicks({ min: 4, max: 9 }, 4);
  assert.equal(t1.length, 5);
  assert.ok(t1[0].value < t1[4].value);
  const t2 = yTicks({ min: 0, max: 3 }, 3);
  assert.equal(t2.length, 4);
});

test('xTicks：基于真实时间戳且跨度大时带日期', () => {
  const ticks = xTicks(T0, T0 + 3 * HOUR_MS, 3);
  assert.equal(ticks.length, 4);
  assert.equal(ticks[0].ts, T0);
  const dayTicks = xTicks(T0, T0 + 3 * 24 * HOUR_MS, 4);
  assert.match(dayTicks[4].label, /\d+\/\d+/);
});

test('filterByWindow：以最新观测为锚回溯，不被链路当前时间影响', () => {
  const pts: SparkPoint[] = Array.from({ length: 25 }, (_, i) => ({
    t: iso(T0 + i * HOUR_MS),
    v: i,
  }));
  const day = filterByWindow(pts, 24 * HOUR_MS);
  // 24h 窗口覆盖几乎全部点，末点必在内（边界受时区取整影响，用范围断言）
  assert.ok(day.length >= 24 && day.length <= 25);
  assert.equal(day[day.length - 1].v, 24);
  const six = filterByWindow(pts, 6 * HOUR_MS);
  // 近 6h：锚点 24，含 24 与之前 6 个整点 => 7 点
  assert.deepEqual(six.map((p) => p.v), [18, 19, 20, 21, 22, 23, 24]);
  // 显式锚点（模拟链路中断后查看）
  const anchored = filterByWindow(pts, 2 * HOUR_MS, T0 + 10 * HOUR_MS);
  assert.deepEqual(anchored.map((p) => p.v), [8, 9, 10]);
});
