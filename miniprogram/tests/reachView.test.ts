// 断面速览组装测试
import { test } from 'node:test';
import assert = require('node:assert/strict');
import { latestMetricViews, reachDisplayName, reachDisplayNames } from '../utils/reachView';

test('三项指标按序组装，flowLevel 单位统一为“级”', () => {
  const views = latestMetricViews([
    { metric: 'flowLevel', value: 1, unit: 'enum0-3' },
    { metric: 'waterLevel', value: 4.78, unit: 'm' },
    { metric: 'turbidity', value: 21.79, unit: 'NTU' },
  ]);
  assert.deepEqual(
    views.map((v) => [v.key, v.value, v.unit]),
    [
      ['waterLevel', '4.78', 'm'],
      ['turbidity', '21.79', 'NTU'],
      ['flowLevel', '1', '级'],
    ],
  );
});

test('缺指标安全降级为 —', () => {
  const views = latestMetricViews([{ metric: 'waterLevel', value: 5, unit: 'm' }]);
  assert.equal(views[0].value, '5.00');
  assert.equal(views[1].value, '—');
  assert.equal(views[2].value, '—');
  assert.equal(latestMetricViews(null)[0].value, '—');
  assert.equal(latestMetricViews(undefined)[0].value, '—');
});

test('断面 id 显示为上中下游中文名，未知 id 原样返回', () => {
  assert.equal(reachDisplayName('reach-a'), '上游 A');
  assert.equal(reachDisplayName('reach-b'), '中游 B');
  assert.equal(reachDisplayName('reach-c'), '下游 C');
  assert.equal(reachDisplayName('reach-x'), 'reach-x');
  assert.deepEqual(reachDisplayNames(['reach-a', 'reach-c']), ['上游 A', '下游 C']);
  assert.deepEqual(reachDisplayNames(undefined), []);
});
