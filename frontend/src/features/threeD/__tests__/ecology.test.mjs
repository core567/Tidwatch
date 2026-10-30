import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTerrainHeight, sampleSurfaceContext, NODE_ANCHORS } from '../riverGeometry.ts';
import { infrastructureExcluded } from '../landscapeLayout.ts';
import { STATION_VIEWS } from '../stationViews.ts';

import { createEcologyLayout as layout } from '../ecologyLayout.ts';

test('quality changes preserve existing vegetation while bounding instance allocation', async () => {
  const low = layout('low'), medium = layout('medium'), high = layout('high');
  const fresh = await import('../ecologyLayout.ts?determinism');
  assert.deepEqual(fresh.createEcologyLayout('medium'), medium, 'fresh module with the same seed reproduces the complete layout');
  for (const kind of ['trees', 'shrubs', 'grass', 'pebbles', 'reeds']) {
    assert.ok(low[kind].length >= 60 && high[kind].length <= 1800);
    assert.ok(low[kind].length < medium[kind].length && medium[kind].length < high[kind].length);
    assert.deepEqual(low[kind], medium[kind].slice(0, low[kind].length), 'quality upgrades retain exact transforms');
    assert.deepEqual(medium[kind], high[kind].slice(0, medium[kind].length));
  }
  assert.ok(medium.trees.length >= 350 && medium.trees.length <= 460);
});

test('roots sit on the rendered dry terrain and crown footprints avoid facilities and scarps', () => {
  const vegetation = layout('high');
  for (const [kind, items] of Object.entries(vegetation)) for (const item of items) {
    const ground = sampleSurfaceContext(item.x, item.z);
    assert.ok(Math.abs(item.y - sampleTerrainHeight(item.x, item.z)) < 1e-8, `${kind} ground contact`);
    assert.ok(ground.bankDistance > (kind === 'trees' ? 1.5 : kind === 'reeds' ? 0.05 : 0.12), `${kind} stays on land`);
    assert.ok(!infrastructureExcluded(item.x, item.z, item.width / 2), `${kind} does not cover facilities`);
    assert.ok(ground.slope < (kind === 'pebbles' ? 0.7 : 0.42), `${kind} avoids steep scarps`);
    assert.ok(Number.isFinite(item.rotation) && Number.isFinite(item.tint));
    if (kind === 'trees') assert.ok(item.height >= 1.7 && item.height <= 4.6);
  }
});

test('station viewpoints retain an open corridor between the camera and the selected node', () => {
  for (const item of layout('high').trees) for (const anchor of NODE_ANCHORS) {
    const view = STATION_VIEWS[anchor.reachId];
    const dx = view.position.x - anchor.position.x, dz = view.position.z - anchor.position.z;
    const t = Math.max(0, Math.min(1, ((item.x - anchor.position.x) * dx + (item.z - anchor.position.z) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(item.x - anchor.position.x - t * dx, item.z - anchor.position.z - t * dz);
    assert.ok(distance >= 1.15 + item.width / 2, `${anchor.reachId} visible through the tree corridor`);
  }
});

test('woodland clusters and clearings span both banks with a sparser distant fringe', () => {
  const trees = layout('medium').trees;
  for (const species of ['deciduous', 'poplar', 'willow']) {
    assert.ok(trees.filter(tree => tree.species === species).length >= 20, `${species} contributes a distinct silhouette`);
  }
  let wooded = 0, distant = 0;
  const quadrants = [0, 0, 0, 0];
  for (const tree of trees) {
    const surface = sampleSurfaceContext(tree.x, tree.z);
    if (surface.woodland > 0.35) wooded++;
    if (Math.abs(tree.x) > 65 || Math.abs(tree.z) > 40) distant++;
    else quadrants[(tree.x > 0 ? 1 : 0) + (tree.z > 0 ? 2 : 0)]++;
  }
  assert.ok(wooded > trees.length * 0.65, 'trees follow the ground woodland region rather than uniform scatter');
  assert.ok(distant > trees.length * 0.08 && distant < trees.length * 0.35, 'fringe exists but has lower density');
  for (const count of quadrants) assert.ok(count > 25, 'visible valley has vegetation in every quadrant');
  for (let a = 0; a < trees.length; a++) for (let b = a + 1; b < trees.length; b++) {
    assert.ok(Math.hypot(trees[a].x - trees[b].x, trees[a].z - trees[b].z) > 0.8, 'trunks are not duplicated or stacked');
  }
});


test('bank reeds occupy shallow margins while trees and shrubs stay above the water demonstration range', () => {
  const vegetation = layout('high');
  assert.ok(Array.isArray(vegetation.reeds) && vegetation.reeds.length >= 100, 'shallow-bank reeds exist');
  for (const item of vegetation.reeds) {
    const ground = sampleSurfaceContext(item.x, item.z);
    assert.ok(ground.bankDistance >= 0.05 && ground.bankDistance < 2.2, 'reeds stay in the bank transition');
    assert.ok(Math.abs(item.y - ground.height) < 1e-8, 'reeds follow actual terrain');
    assert.ok(!infrastructureExcluded(item.x, item.z, item.width / 2), 'reeds keep access to equipment and bridge clear');
  }
  for (const item of [...vegetation.trees, ...vegetation.shrubs]) assert.ok(item.y > 0.16, 'dry plants clear maximum simulated water by at least 0.04');
  assert.ok(layout('medium').trees.length <= 460, 'visual refinement does not expand the tree budget');
});
