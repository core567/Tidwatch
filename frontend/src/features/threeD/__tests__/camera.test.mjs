import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { useCameraStore } from '../cameraStore.ts';
import { NODE_ANCHORS } from '../riverGeometry.ts';

test('requesting the current view starts another observable flight', () => {
  const state = useCameraStore.getState();
  state.flyTo('reach-a');
  state.setFlying(false);
  const first = useCameraStore.getState();
  state.flyTo('reach-a');
  const second = useCameraStore.getState();
  assert.equal(second.view, 'reach-a');
  assert.equal(second.flying, true);
  assert.equal(second.requestId, first.requestId + 1);
  state.setFlying(false);
});

test('a newer station request supersedes the active flight', () => {
  const { flyTo } = useCameraStore.getState();
  flyTo('reach-a');
  const firstId = useCameraStore.getState().requestId;
  flyTo('reach-c');
  assert.equal(useCameraStore.getState().view, 'reach-c');
  assert.equal(useCameraStore.getState().requestId, firstId + 1);
  useCameraStore.getState().setFlying(false);
});

test('invalid runtime target preserves the current flight and view', () => {
  const before = useCameraStore.getState();
  before.flyTo('unknown-station');
  assert.equal(useCameraStore.getState(), before);
});

test('station framing follows the physical shore anchor, not the river centerline', async () => {
  const anchor = NODE_ANCHORS[0];
  const original = anchor.position;
  anchor.position = new Vector3(41, 3, -17);
  try {
    const { viewFor } = await import('../stationViews.ts?shore-fixture');
    const view = viewFor(anchor.reachId);
    assert.equal(view.target.x, 41);
    assert.equal(view.target.z, -17);
    assert.ok(view.target.y > 3, 'look toward the station above its foundation');
  } finally {
    anchor.position = original;
  }
});

test('flight path preserves its endpoints and eases away from both ends', async () => {
  const { createCameraFlight } = await import('../cameraPath.ts');
  const from = new Vector3(-12, 5, 0);
  const to = new Vector3(12, 6, 0);
  const flight = createCameraFlight(from, to, () => 0);
  assert.ok(flight.positionAt(0).distanceTo(from) < 1e-10);
  assert.ok(flight.positionAt(1).distanceTo(to) < 1e-10);
  assert.ok(flight.positionAt(0.01).distanceTo(from) < 0.02);
  assert.ok(flight.positionAt(0.99).distanceTo(to) < 0.02);
  assert.deepEqual(flight.positionAt(-1).toArray(), from.toArray());
  assert.deepEqual(flight.positionAt(2).toArray(), to.toArray());
});

test('flight clears terrain between low endpoints rather than crossing a bank', async () => {
  const { createCameraFlight } = await import('../cameraPath.ts');
  const terrain = (x) => 11 * Math.exp(-(((x - 1.7) / 2.2) ** 2));
  const flight = createCameraFlight(new Vector3(-12, 3, 0), new Vector3(12, 3, 0), terrain);
  for (let i = 0; i <= 1000; i++) {
    const p = flight.positionAt(i / 1000);
    assert.ok(p.y >= terrain(p.x, p.z) + 1.8 - 1e-8, `terrain collision at frame ${i}`);
  }
});


test('all station and overview routes preserve safe endpoints and clear the rendered terrain', async () => {
  const { createCameraFlight } = await import('../cameraPath.ts');
  const { sampleTerrainHeight } = await import('../riverGeometry.ts');
  const { viewFor } = await import('../stationViews.ts');
  const views = ['overview', 'reach-a', 'reach-b', 'reach-c'].map(viewFor);
  for (const from of views) for (const to of views) {
    const flight = createCameraFlight(from.position, to.position, sampleTerrainHeight);
    for (let i = 0; i <= 200; i++) {
      const p = flight.positionAt(i / 200);
      assert.ok(p.y >= sampleTerrainHeight(p.x, p.z) + 1.8 - 1e-8);
    }
    assert.ok(flight.positionAt(0).distanceTo(from.position) < 1e-10);
    assert.ok(flight.positionAt(1).distanceTo(to.position) < 1e-10);
  }
});

test('a retargeted route starts exactly at the interrupted camera position', async () => {
  const { createCameraFlight } = await import('../cameraPath.ts');
  const first = createCameraFlight(new Vector3(-12, 5, 0), new Vector3(12, 7, 0), () => 0);
  const interrupted = first.positionAt(0.42);
  const next = createCameraFlight(interrupted, new Vector3(0, 4, 12), () => 0);
  assert.ok(next.positionAt(0).distanceTo(interrupted) < 1e-10);
  interrupted.set(999, 999, 999);
  assert.ok(next.positionAt(0).distanceTo(first.positionAt(0.42)) < 1e-10);
  assert.deepEqual(next.positionAt(1).toArray(), [0, 4, 12]);
});

test('facility-aware flight clears the bridge railing and all fixed scene structures', async () => {
  const { createCameraFlight } = await import('../cameraPath.ts');
  const { BRIDGE, sceneObstacleHeight } = await import('../landscapeLayout.ts');
  const { viewFor } = await import('../stationViews.ts');
  const b=BRIDGE;
  const from = new Vector3(b.x, b.deckY+2.8, b.z-b.halfSpan-6);
  const to = new Vector3(b.x, b.deckY+2.8, b.z+b.halfSpan+6);
  const routes = [[from,to],...['overview','reach-a','reach-b','reach-c'].flatMap(a=>
    ['overview','reach-a','reach-b','reach-c'].map(c=>[viewFor(a).position,viewFor(c).position]))];
  for (const [start,end] of routes) {
    const flight=createCameraFlight(start,end,sceneObstacleHeight);
    for(let i=0;i<=500;i++) {
      const p=flight.positionAt(i/500);
      assert.ok(p.y>=sceneObstacleHeight(p.x,p.z)+1.8-1e-8,'camera clears structure envelope');
    }
  }
});
