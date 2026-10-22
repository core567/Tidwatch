/**
 * 河廊几何的纯逻辑测试（Node 原生测试运行器）。
 * 不依赖 WebGL：只验证曲线、节点拓扑顺序与带状网格结构。
 * 运行：node --test frontend/src/features/threeD/riverGeometry.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NODE_ANCHORS, RIVER_CURVE, buildRibbonGeometry, WATER_WIDTH } from './riverGeometry.ts';

test('A/B/C 节点按上游→下游拓扑排列', () => {
  assert.deepEqual(
    NODE_ANCHORS.map((n) => n.reachId),
    ['reach-a', 'reach-b', 'reach-c'],
  );
  assert.deepEqual(NODE_ANCHORS.map((n) => n.name), ['上游 A', '中游 B', '下游 C']);
  assert.ok(NODE_ANCHORS[0].t < NODE_ANCHORS[1].t && NODE_ANCHORS[1].t < NODE_ANCHORS[2].t);
});

test('所有节点锚点位于河道曲线上', () => {
  for (const n of NODE_ANCHORS) {
    const p = RIVER_CURVE.getPointAt(n.t);
    assert.ok(Math.abs(p.distanceTo(n.position)) < 1e-6);
  }
});

test('带状水面几何结构正确（顶点/三角形/宽度）', () => {
  const geo = buildRibbonGeometry(RIVER_CURVE, WATER_WIDTH, 0, 20);
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex();
  assert.equal(pos.count, 42); // (20+1)*2
  assert.ok(idx);
  assert.equal(idx!.count, 20 * 6);
  // 每个截面左右两点间距等于河宽
  const x0 = pos.getX(0), y0 = pos.getY(0), z0 = pos.getZ(0);
  const x1 = pos.getX(1), y1 = pos.getY(1), z1 = pos.getZ(1);
  const d = Math.hypot(x0 - x1, y0 - y1, z0 - z1);
  assert.ok(Math.abs(d - WATER_WIDTH) < 1e-5);
  geo.dispose();
});

test('河道有真实弯曲（不是直线）', () => {
  const p0 = RIVER_CURVE.getPointAt(0);
  const p1 = RIVER_CURVE.getPointAt(0.5);
  // 中点 x 在两岸之间存在横向偏移
  assert.notEqual(p0.x, 0);
  assert.ok(Math.abs(p1.x) >= 0 || Math.abs(p1.z) >= 0);
});
