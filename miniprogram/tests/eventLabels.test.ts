// 事件状态派生测试
import { test } from 'node:test';
import assert = require('node:assert/strict');
import { eventStatusView, isEventActive, triggerMetricText } from '../utils/eventLabels';

test('事件八态均有中文文案与色调且无遗漏', () => {
  for (const s of ['OPEN', 'INVESTIGATING', 'MONITORING', 'ESCALATED', 'NARROWED', 'RECOVERY_PENDING', 'RECOVERED', 'UNRESOLVED']) {
    const v = eventStatusView(s);
    assert.ok(v.text.length > 0, `${s} 无文案`);
    assert.ok(['ok', 'watch', 'danger', 'offline'].includes(v.tone), `${s} 色调非法`);
    assert.equal(isEventActive(s), s !== 'RECOVERED' && s !== 'UNRESOLVED');
  }
});

test('触发指标中文名', () => {
  assert.equal(triggerMetricText('waterLevel'), '水位');
  assert.equal(triggerMetricText('turbidity'), '浊度');
  assert.equal(triggerMetricText('flowLevel'), '水流等级');
  // 未知指标原样返回，不编造中文名
  assert.equal(triggerMetricText('do2'), 'do2');
  assert.equal(triggerMetricText(null), '—');
});
