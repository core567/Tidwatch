import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_ANCHORS, sampleTerrainHeight, buildWaterGeometry, RIVER_CURVE, WATER_WIDTH } from '../riverGeometry.ts';
import { buildStationGeometry, stationLayout } from '../stationGeometry.ts';

const water = buildWaterGeometry(RIVER_CURVE, WATER_WIDTH);
const wp = water.getAttribute('position'), columns = 7;
function renderedBank(x, column) {
  for (let row = 0; row < wp.count / columns - 1; row++) {
    const a = row * columns + column, b = a + columns;
    if (x < wp.getX(a) || x > wp.getX(b)) continue;
    const t = (x - wp.getX(a)) / (wp.getX(b) - wp.getX(a));
    return wp.getZ(a) * (1 - t) + wp.getZ(b) * t;
  }
  throw new Error('outside rendered water');
}

test('all station feet embed into sampled terrain and connect to the platform', () => {
  for (const anchor of NODE_ANCHORS) {
    const layout = stationLayout(anchor);
    assert.equal(layout.feet.length, 4);
    for (const foot of layout.feet) {
      for (const dx of [-.135, 0, .135]) for (const dz of [-.135, 0, .135]) {
        const p = layout.world(foot.x + dx, foot.z + dz);
        const ground = sampleTerrainHeight(p.x, p.z) - anchor.position.y;
        assert.ok(foot.bottom < ground, `${anchor.reachId}: footing intersects ground`);
        assert.ok(foot.top > ground, `${anchor.reachId}: footing rises above ground`);
      }
      assert.ok(foot.top < layout.deckTop - .17, 'support has positive height below slab');
    }
  }
});

test('measurement heads and staff are over the rendered water with submerged staff bases', () => {
  for (const anchor of NODE_ANCHORS) {
    const layout = stationLayout(anchor), p = layout.staffWorld;
    assert.ok(p.z > renderedBank(p.x, 0) + .07, `${anchor.reachId}: inside left edge`);
    assert.ok(p.z < renderedBank(p.x, 6) - .07, `${anchor.reachId}: inside right edge`);
    const bed = sampleTerrainHeight(p.x, p.z);
    assert.ok(bed < 0, 'measurement is above wet terrain');
    assert.ok(anchor.position.y + layout.waterY - .15 <= bed, 'staff is driven into shallow bed');
  }
});

test('station assembly fits the documented scale and uses exactly four opaque batches', () => {
  const counts = [];
  for (const anchor of NODE_ANCHORS) {
    const model = buildStationGeometry(anchor);
    assert.equal(Object.keys(model.geometry).length, 4);
    let count = 0;
    for (const geometry of Object.values(model.geometry)) {
      const p = geometry.getAttribute('position');
      const n = geometry.getAttribute('normal'), c = geometry.getAttribute('color');
      assert.equal(c.count, p.count);
      assert.equal(n.count, p.count);
      count += p.count;
      for (let i = 0; i < p.count; i++) {
        assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
        assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= 1.75, `${anchor.reachId}: collision envelope`);
        assert.ok(p.getY(i) <= 2.65, `${anchor.reachId}: height below camera collision ceiling`);
        assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
      }
      geometry.dispose();
    }
    assert.ok(count < 10000, 'bounded detailed model allocation');
    counts.push(count);
    model.outline.dispose();model.solar.dispose();
  }
  assert.equal(new Set(counts).size, 3, 'cohesive models retain station-specific details');
  water.dispose();
});
