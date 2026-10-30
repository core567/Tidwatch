import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE, ROAD_EXTENT, ROAD_HALF_WIDTH, roadPoint, infrastructureExcluded, sceneObstacleHeight, BUILDING, BUILDING_BASE } from '../landscapeLayout.ts';
import { sampleTerrainHeight, NODE_ANCHORS } from '../riverGeometry.ts';

test('bridge approaches clear their full width while keeping a gentle illustrative grade', () => {
  for (const sign of [-1, 1]) {
    let prior = roadPoint(sign * BRIDGE.halfSpan);
    for (let d = BRIDGE.halfSpan + .037; d <= ROAD_EXTENT; d += .037) {
      const p = roadPoint(sign * d);
      assert.ok(Number.isFinite(p.y));
      for (const lateral of [-ROAD_HALF_WIDTH, -.45, 0, .45, ROAD_HALF_WIDTH])
        assert.ok(p.y >= sampleTerrainHeight(p.x + lateral, p.z) + .01, 'full road width clears ground');
      assert.ok(Math.abs(p.y - prior.y) / Math.hypot(p.x - prior.x, p.z - prior.z) <= .16, 'bounded road grade');
      assert.ok(infrastructureExcluded(p.x, p.z, .2));
      prior = p;
    }
  }
});

test('both bridge connections share the exact deck elevation without a height step', () => {
  for (const sign of [-1, 1]) {
    const at = roadPoint(sign * BRIDGE.halfSpan);
    const inside = roadPoint(sign * (BRIDGE.halfSpan - .001));
    const outside = roadPoint(sign * (BRIDGE.halfSpan + .001));
    assert.ok(Math.abs(at.y - BRIDGE.deckY) < 1e-10);
    assert.ok(Math.abs(inside.y - at.y) < 1e-10);
    assert.ok(Math.abs(outside.y - at.y) <= .00016);
    assert.ok(Math.abs(at.x - BRIDGE.x) < 1e-10);
  }
});

test('camera envelope covers bridge, elevated approaches, management building and full station arms', () => {
  assert.ok(sceneObstacleHeight(BRIDGE.x, BRIDGE.z) >= BRIDGE.deckY + .65);
  assert.ok(sceneObstacleHeight(BUILDING.x, BUILDING.z) >= BUILDING_BASE + 1.9);
  for (const a of NODE_ANCHORS) {
    assert.ok(sceneObstacleHeight(a.position.x, a.position.z) >= a.position.y + 2.7);
    assert.ok(sceneObstacleHeight(a.position.x + 1.7, a.position.z) >= a.position.y + 2.7, 'station arm is covered');
  }
  const approach = roadPoint(BRIDGE.halfSpan + 1);
  assert.ok(sceneObstacleHeight(approach.x, approach.z) >= approach.y + .018, 'elevated approach is a camera obstacle');
});