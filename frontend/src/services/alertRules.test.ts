import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_ALERT_RULE_PARAMS,
  decideAlert,
  parseRuleParams,
  seenStateOf,
  severityFor,
  thresholdLabel,
  type SeenEventState,
} from './alertRules.ts';

type State = { status: string; priority: string; version?: number };

function decide(previous: SeenEventState | undefined, event: State) {
  return decideAlert(previous, { version: 1, ...event });
}

function seen(status: string, priority: string): SeenEventState {
  return { status, priority, version: 1, updatedAt: '2026-11-05T12:00:00Z' };
}

test('新事件：无基线时产生 new 告警', () => {
  assert.deepEqual(decide(undefined, { status: 'INVESTIGATING', priority: 'NORMAL' }), {
    kind: 'new',
    severity: 'general',
  });
});

test('新事件：HIGH 优先级为 severe', () => {
  assert.equal(decide(undefined, { status: 'OPEN', priority: 'HIGH' })?.severity, 'severe');
  assert.equal(severityFor({ status: 'OPEN', priority: 'HIGH' }), 'severe');
  assert.equal(severityFor({ status: 'ESCALATED', priority: 'NORMAL' }), 'severe');
});

test('去重：同一状态重复评估不再告警', () => {
  const previous = seen('INVESTIGATING', 'NORMAL');
  assert.equal(decide(previous, { status: 'INVESTIGATING', priority: 'NORMAL' }), null);
  assert.equal(decide(previous, { status: 'MONITORING', priority: 'NORMAL' }), null);
});

test('升级：优先级提高触发 escalated', () => {
  assert.deepEqual(decide(seen('INVESTIGATING', 'NORMAL'), {
    status: 'INVESTIGATING',
    priority: 'HIGH',
  }), { kind: 'escalated', severity: 'severe' });
});

test('升级：状态变为 ESCALATED 触发 escalated', () => {
  assert.deepEqual(decide(seen('INVESTIGATING', 'NORMAL'), {
    status: 'ESCALATED',
    priority: 'NORMAL',
  }), { kind: 'escalated', severity: 'severe' });
});

test('重开：终态后重新进入活动状态触发 reopened', () => {
  assert.deepEqual(decide(seen('RECOVERED', 'HIGH'), {
    status: 'INVESTIGATING',
    priority: 'HIGH',
  }), { kind: 'reopened', severity: 'severe' });
});

test('恢复：活动状态转为 RECOVERED 触发 recovered', () => {
  assert.deepEqual(decide(seen('INVESTIGATING', 'HIGH'), {
    status: 'RECOVERED',
    priority: 'HIGH',
  }), { kind: 'recovered', severity: 'recovery' });
});

test('恢复去重：已恢复事件重复评估不再告警', () => {
  const previous = seen('RECOVERED', 'HIGH');
  assert.equal(decide(previous, { status: 'RECOVERED', priority: 'HIGH' }), null);
});

test('初始化静默：终态事件无基线时不告警', () => {
  assert.equal(decide(undefined, { status: 'RECOVERED', priority: 'HIGH' }), null);
  assert.equal(decide(undefined, { status: 'UNRESOLVED', priority: 'NORMAL' }), null);
});

test('基线静默：seenStateOf 建立基线后不重复提醒', () => {
  const event = { status: 'INVESTIGATING', priority: 'NORMAL', version: 3, updatedAt: '2026-11-05T12:00:00Z' };
  assert.equal(decideAlert(seenStateOf(event), event), null);
});

test('规则参数：默认值来自 demo-rules-v1', () => {
  assert.deepEqual(parseRuleParams(), DEMO_ALERT_RULE_PARAMS);
  assert.deepEqual(parseRuleParams({}), DEMO_ALERT_RULE_PARAMS);
});

test('规则参数：优先使用后端 diagnostics 返回值', () => {
  assert.deepEqual(parseRuleParams({
    water_level_flood: 9.1,
    water_level_watch: 7.4,
    turbidity_muddy: 55,
  }), { waterLevelFlood: 9.1, waterLevelWatch: 7.4, turbidityMuddy: 55 });
});

test('规则参数：非法值回退到默认', () => {
  assert.deepEqual(parseRuleParams({
    water_level_flood: 0,
    water_level_watch: -1,
    turbidity_muddy: Number.NaN,
  }), DEMO_ALERT_RULE_PARAMS);
});

test('阈值展示：按指标与优先级输出，并支持自定义参数', () => {
  const water = { priority: 'HIGH', trigger: { reachId: 'reach-b', metric: 'waterLevel', magnitude: 1, direction: 'UP', ruleId: 'demo-rules-v1' } } as const;
  const turbidity = { priority: 'NORMAL', trigger: { reachId: 'reach-b', metric: 'turbidity', magnitude: 1, direction: 'UP', ruleId: 'demo-rules-v1' } } as const;
  assert.equal(thresholdLabel(water), '8.5 m');
  assert.equal(thresholdLabel({ ...water, priority: 'NORMAL' }), '7.0 m');
  assert.equal(thresholdLabel(turbidity), '60 NTU');
  assert.equal(thresholdLabel(water, { waterLevelFlood: 9.1, waterLevelWatch: 7.4, turbidityMuddy: 55 }), '9.1 m');
  assert.equal(thresholdLabel({ priority: 'NORMAL', trigger: null } as never), '—');
});
