// 人工复测规则测试
import { test } from 'node:test';
import assert = require('node:assert/strict');
import {
  suggestedMetrics,
  validateMetricFormat,
  checkMeasurements,
  buildMeasurementsPayload,
  type MeasureState,
} from '../utils/taskRequirements';

const st = (key: MeasureState['key'], raw = '', reason = ''): MeasureState => ({ key, raw, reason });

test('建议测量项按任务类型派生，数据链路核查无复测项', () => {
  assert.deepEqual(suggestedMetrics('MANUAL_CHECK'), ['waterLevel', 'turbidity', 'flowLevel']);
  assert.deepEqual(suggestedMetrics('FOCUS_REACH_C'), ['waterLevel', 'turbidity']);
  assert.deepEqual(suggestedMetrics('CONTINUE_OBSERVE'), ['waterLevel', 'turbidity']);
  assert.deepEqual(suggestedMetrics('INSPECT_DATA_LINK'), []);
  assert.deepEqual(suggestedMetrics('UNKNOWN_ACTION'), []);
});

test('格式校验：空值放行（交给完整性规则）、非数字/负数/枚举拦截', () => {
  assert.equal(validateMetricFormat('waterLevel', '').ok, true);
  assert.equal(validateMetricFormat('waterLevel', '5.92').ok, true);
  assert.equal(validateMetricFormat('waterLevel', 'abc').ok, false);
  assert.equal(validateMetricFormat('turbidity', '-1').ok, false);
  assert.equal(validateMetricFormat('flowLevel', '1.5').ok, false);
  assert.equal(validateMetricFormat('flowLevel', '3').ok, true);
  assert.equal(validateMetricFormat('flowLevel', '4').ok, false);
});

test('完整性：建议项必须有值或原因，非建议项留空合法', () => {
  const suggested = suggestedMetrics('FOCUS_REACH_C'); // 水位/浊度
  // 全部留空 → 两条错误
  const r1 = checkMeasurements([st('waterLevel'), st('turbidity'), st('flowLevel')], suggested);
  assert.equal(r1.ok, false);
  assert.equal(r1.errors.length, 2);
  // 建议项填值、非建议项留空 → 通过
  const r2 = checkMeasurements([st('waterLevel', '5.9'), st('turbidity', '23'), st('flowLevel')], suggested);
  assert.equal(r2.ok, true);
  // 建议项用未测原因 → 通过
  const r3 = checkMeasurements(
    [st('waterLevel', '', '安全无法靠近'), st('turbidity', '23'), st('flowLevel')],
    suggested,
  );
  assert.equal(r3.ok, true);
  // 值与原因同时存在 → 语义冲突
  const r4 = checkMeasurements(
    [st('waterLevel', '5.9', '设备故障'), st('turbidity', '23'), st('flowLevel')],
    suggested,
  );
  assert.equal(r4.ok, false);
  assert.match(r4.errors[0], /不能同时/);
  // 非建议任务（INSPECT_DATA_LINK）：三项全空也合法
  const r5 = checkMeasurements([st('waterLevel'), st('turbidity'), st('flowLevel')], []);
  assert.equal(r5.ok, true);
});

test('payload 构造：有值带数值，未测带原因且 value=null', () => {
  const payload = buildMeasurementsPayload([
    st('waterLevel', '5.92'),
    st('turbidity', '', '安全无法靠近'),
    st('flowLevel'),
  ]);
  assert.deepEqual(payload, [
    { metric: 'waterLevel', value: 5.92, unit: 'm', sourceType: 'MANUAL' },
    { metric: 'turbidity', value: null, unit: 'NTU', sourceType: 'MANUAL', unmeasuredReason: '安全无法靠近' },
  ]);
});
