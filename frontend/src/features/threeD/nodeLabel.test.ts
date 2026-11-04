import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelScaleForDistance, resolveLabelLod } from './nodeLabelProjection.ts';

test('LOD 近景进入/退出带缓冲', () => {
  assert.equal(resolveLabelLod(17, 'mid'), 'near');
  assert.equal(resolveLabelLod(20, 'near'), 'near');
  assert.equal(resolveLabelLod(24, 'near'), 'mid');
});

test('LOD 远景进入/退出带缓冲', () => {
  assert.equal(resolveLabelLod(50, 'mid'), 'mid');
  assert.equal(resolveLabelLod(53, 'mid'), 'far');
  assert.equal(resolveLabelLod(47, 'far'), 'far');
  assert.equal(resolveLabelLod(45, 'far'), 'mid');
  assert.equal(resolveLabelLod(17, 'far'), 'near');
});

test('标签尺寸随距离递减并限制在可读范围内', () => {
  assert.equal(labelScaleForDistance(0), 1.05);
  assert.equal(labelScaleForDistance(14), 1.05);
  assert.ok(labelScaleForDistance(30) > labelScaleForDistance(40));
  assert.equal(labelScaleForDistance(80), 0.82);
  for (let distance = 0; distance <= 120; distance += 5) {
    const scale = labelScaleForDistance(distance);
    assert.ok(scale >= 0.82 && scale <= 1.05, `distance ${distance} scale ${scale}`);
  }
});
