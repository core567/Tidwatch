import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReachTrends } from './reachTrends';
import type { Observation } from '@/types/contract';

// 构造观测的工厂（时间用相对分钟）
function obs(min: number, value: number, over: Partial<Observation> = {}): Observation {
  return {
    observationId: `o-${min}-${value}`,
    reachId: 'reach-a',
    metric: 'waterLevel',
    value,
    unit: 'm',
    observedAt: new Date(Date.UTC(2026, 9, 25, 10, min)).toISOString(),
    ingestedAt: '',
    sourceType: 'SIMULATED',
    scenarioId: over.scenarioId ?? null,
    qualityFlag: (over.qualityFlag as Observation['qualityFlag']) ?? 'GOOD',
  } as Observation;
}

const input = (rows: Observation[], reachId = 'reach-a') => ({
  reachId,
  name: reachId === 'reach-a' ? '上游 A' : reachId === 'reach-b' ? '中游 B' : '下游 C',
  color: '#1e6fe0',
  rows,
});

test('按真实时间排序；正常 1 分钟间隔不断线', () => {
  const rows = [obs(3, 4.3), obs(1, 4.1), obs(2, 4.2)];
  const r = buildReachTrends([input(rows)], 15 * 60000, []);
  const real = r.lines[0].points.filter((p) => p.value !== null);
  assert.equal(real.length, 3);
  assert.ok(real[0].t <= real[1].t && real[1].t <= real[2].t);
  assert.equal(r.stats[0].min, 4.1);
  assert.equal(r.stats[0].max, 4.3);
});

test('超过 gap 的缺口插入 null 分段（缺测断线，不补值）', () => {
  const rows = [obs(0, 4.0), obs(120, 4.1)]; // 间隔 120 分钟
  const r = buildReachTrends([input(rows)], 15 * 60000, []);
  const nulls = r.lines[0].points.filter((p) => p.value === null);
  assert.equal(nulls.length, 2); // 缺口两端各一个 null 占位
  assert.equal(r.stats[0].gaps.length, 1);
});

test('S2/S3 注入的 9m 尖峰保留并计入异常点，不被平滑/删除', () => {
  const rows = [
    obs(0, 4.0),
    { ...obs(1, 9.1), scenarioId: 'S2' },
    { ...obs(2, 9.1), scenarioId: 'S2' },
    obs(3, 4.1),
  ];
  const r = buildReachTrends([input(rows)], 15 * 60000, [7, 8.5]);
  assert.equal(r.stats[0].max, 9.1);
  assert.equal(r.stats[0].outlierCount, 2);
  assert.equal(r.outliers.length, 2);
  assert.equal(r.outliers[0].value, 9.1);
});

test('同毫秒同值重复去重；不同值不被误删', () => {
  const a = obs(5, 4.2);
  const dup = { ...obs(5, 4.2), observationId: 'dup' };
  const other = obs(5, 4.9); // 同时间不同值（合法）
  const r = buildReachTrends([input([a, dup, other])], 15 * 60000, []);
  assert.equal(r.coverage[0].count, 2);
  assert.equal(r.coverage[0].duplicated, 1);
});

test('无数据断面：count=0，统计值为 null，不产生异常', () => {
  const r = buildReachTrends([input([], 'reach-b')], 15 * 60000, []);
  assert.equal(r.coverage[0].count, 0);
  assert.equal(r.stats[0].min, null);
  assert.equal(r.stats[0].outlierCount, 0);
});

test('覆盖率：连续点 100%，含大缺口时下降', () => {
  const cont = [obs(0, 4), obs(1, 4), obs(2, 4)];
  const r1 = buildReachTrends([input(cont)], 15 * 60000, []);
  assert.equal(r1.stats[0].coveragePct, 100);

  const gap = [obs(0, 4), obs(100, 4)]; // 100 分钟跨度，缺口占绝大多数
  const r2 = buildReachTrends([input(gap)], 15 * 60000, []);
  assert.ok(r2.stats[0].coveragePct < 50);
});

test('完整范围使用查询窗口；聚焦范围贴合实际首末观测并留白', () => {
  const rows = [obs(100, 4), obs(200, 4.2)];
  const queryStart = Date.UTC(2026, 9, 25, 8, 0);
  const queryEnd = Date.UTC(2026, 9, 25, 18, 0);
  const r = buildReachTrends([input(rows)], 15 * 60000, [], { queryStart, queryEnd });
  // 完整模式：X 轴覆盖查询窗口（保留之后的长缺测）
  assert.equal(r.xRangeFull?.min, queryStart);
  assert.equal(r.xRangeFull?.max, queryEnd);
  // 聚焦模式：X 轴围绕实际数据（100~200 分钟点），不含查询起点
  assert.ok(r.xRangeFocus!.min > queryStart);
  assert.ok(r.xRangeFocus!.max < queryEnd);
  // 三断面共用同一 X 轴（两次构建结果一致），不各自拉伸
  const r2 = buildReachTrends([input(rows), input(rows, 'reach-b')], 15 * 60000, [], { queryStart, queryEnd });
  assert.deepEqual(r2.xRangeFull, r.xRangeFull);
});

test('无数据时不产生 X 范围', () => {
  const r = buildReachTrends([input([])], 15 * 60000, [], { queryStart: 0, queryEnd: 1000 });
  assert.equal(r.xRangeFocus, null);
  assert.equal(r.xRangeFull, null);
});
