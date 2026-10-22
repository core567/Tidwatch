import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OVERVIEW_VIEW, STATION_VIEWS, viewFor } from './stationViews.ts';
import { NODE_ANCHORS } from './riverGeometry.ts';

test('每个节点有独立站位且不同于全景', () => {
  for (const a of NODE_ANCHORS) {
    const v = STATION_VIEWS[a.reachId];
    assert.ok(v, `${a.reachId} 缺站位`);
    assert.ok(v.position.distanceTo(OVERVIEW_VIEW.position) > 5, `${a.reachId} 站位应远离全景相机`);
    // 相机看向节点附近（target 与节点距离很近）
    assert.ok(v.target.distanceTo(a.position) < 2, `${a.reachId} 目标应在节点旁`);
  }
});

test('未知 view 回退全景', () => {
  assert.equal(viewFor('nope'), OVERVIEW_VIEW);
  assert.equal(viewFor('overview'), OVERVIEW_VIEW);
});

test('三个站位两两不同（连切时相机确实移动）', () => {
  const ids = NODE_ANCHORS.map((n) => n.reachId);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      assert.ok(
        STATION_VIEWS[ids[i]].position.distanceTo(STATION_VIEWS[ids[j]].position) > 1,
        `${ids[i]} 与 ${ids[j]} 站位过于接近`,
      );
    }
  }
});
