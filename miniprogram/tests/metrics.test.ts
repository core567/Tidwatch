// 指标元数据测试（与 PC 端口径一致）
import { test } from 'node:test';
import assert = require('node:assert/strict');
import {
  simMetricName,
  simMetricUnit,
  simMetricUnitByKey,
  waterClassTone,
  formatOfficialValue,
  OFFICIAL_METRICS,
} from '../utils/metrics';

test('模拟三指标中文名与展示单位', () => {
  assert.equal(simMetricName('waterLevel'), '水位');
  assert.equal(simMetricName('turbidity'), '浊度');
  assert.equal(simMetricName('flowLevel'), '水流等级');
  assert.equal(simMetricName('unknown'), 'unknown');
  // flowLevel 原始 unit enum0-3 不展示，统一为“级”
  assert.equal(simMetricUnit('enum0-3', 'flowLevel'), '级');
  assert.equal(simMetricUnit('m', 'waterLevel'), 'm');
  assert.equal(simMetricUnitByKey('turbidity'), 'NTU');
});

test('水质类别配色：Ⅰ/Ⅱ 青绿、Ⅲ 橙、其他红、空值灰', () => {
  assert.equal(waterClassTone('Ⅰ'), 'ok');
  assert.equal(waterClassTone('Ⅱ'), 'ok');
  assert.equal(waterClassTone('Ⅲ'), 'watch');
  assert.equal(waterClassTone('劣Ⅴ'), 'danger');
  assert.equal(waterClassTone(null), 'off');
});

test('官方指标按位数格式化，缺测/非数字安全降级', () => {
  const def = OFFICIAL_METRICS.find((d) => d.key === 'ph');
  assert.ok(def);
  const rec = { ph: 7.73 } as OfficialAutoRecord;
  assert.equal(formatOfficialValue(rec, def!), '7.73');
  // null 字段显示 —，不画成 0
  const doDef = OFFICIAL_METRICS.find((d) => d.key === 'dissolvedOxygen')!;
  assert.equal(formatOfficialValue({ dissolvedOxygen: null } as unknown as OfficialAutoRecord, doDef), '—');
  assert.equal(formatOfficialValue(null, doDef), '—');
  // 无单位指标（pH）不追加空格单位
  assert.equal(formatOfficialValue(rec, def!), '7.73');
});
