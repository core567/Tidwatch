import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareRange, medianOf, splitPhases } from './comparePhases.ts';
import type { Observation } from '@/types/contract';

const T = 1_700_000_000_000; // 固定基准毫秒
function obs(min: number, value: number, qf = 'GOOD'): Observation {
  return {
    observationId: `o-${min}-${value}`,
    reachId: 'reach-a',
    metric: 'waterLevel',
    value,
    unit: 'm',
    observedAt: new Date(T + min * 60000).toISOString(),
    ingestedAt: new Date(T + min * 60000).toISOString(),
    sourceType: 'SIMULATED',
    qualityFlag: qf,
    ruleVersion: 'x',
  } as Observation;
}

test('medianOf', () => {
  assert.equal(medianOf([]), null);
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([1, 2, 3, 4]), 2.5);
});

test('完整三段：基线/异常/处置后正确切分', () => {
  // firstSeen=T+0，anchor=T+120
  const rows = [
    ...[-50, -40, -30].map((m, i) => obs(m, 4.2 + i * 0.01)), // 基线
    ...[20, 40, 60, 80].map((m, i) => obs(m, 8.5 + i * 0.1)), // 异常
    ...[130, 140, 150].map((m, i) => obs(m, 4.25 + i * 0.01)), // 处置后
  ];
  const p = splitPhases(rows, T, T + 120 * 60000);
  assert.equal(p.BASELINE.count, 3);
  assert.equal(p.ANOMALY.count, 4);
  assert.equal(p.POST.count, 3);
  assert.ok(p.POST.median != null && p.POST.median < 5);
});

test('锚点缺失：不产生处置后段，全部归基线/异常', () => {
  const rows = [obs(-10, 4.2), obs(30, 8.0)];
  const p = splitPhases(rows, T, null);
  assert.equal(p.BASELINE.count, 1);
  assert.equal(p.ANOMALY.count, 1);
  assert.equal(p.POST.count, 0);
  assert.equal(p.POST.median, null);
});

test('样本不足：处置后 0 点或单点如实反映', () => {
  const rows = [obs(-20, 4.2), obs(20, 8.0), obs(130, 4.3)];
  const p = splitPhases(rows, T, T + 120 * 60000);
  assert.equal(p.POST.count, 1);
  assert.equal(p.POST.median, 4.3);
});

test('非 GOOD 观测被剔除，不计入三段', () => {
  const rows = [obs(20, 9.9, 'STALE'), obs(25, 8.0, 'GOOD')];
  const p = splitPhases(rows, T, T + 120 * 60000);
  assert.equal(p.ANOMALY.count, 1);
});

test('compareRange：有锚点覆盖三段，无锚点不越界', () => {
  const withAnchor = compareRange(T, T + 120 * 60000, 60);
  assert.ok(withAnchor);
  assert.equal(new Date(withAnchor!.start).getTime(), T - 60 * 60000);
  assert.equal(new Date(withAnchor!.end).getTime(), T + 180 * 60000);
  assert.equal(compareRange(null, T), null);
});
