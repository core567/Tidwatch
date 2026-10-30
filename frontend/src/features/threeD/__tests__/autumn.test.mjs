import test from 'node:test';import assert from 'node:assert/strict';
import {buildRidge} from '../ridgeGeometry.ts';
import {meadowPoints} from '../meadowLayout.ts';
import {sampleTerrainHeight,NODE_ANCHORS} from '../riverGeometry.ts';
import {infrastructureExcluded} from '../landscapeLayout.ts';
test('three deterministic ridge bands stay outside navigation and below per-layer budget',()=>{for(let layer=0;layer<3;layer++){const g=buildRidge(layer),again=buildRidge(layer),p=g.getAttribute('position'),n=g.getAttribute('normal');assert.deepEqual(p.array,again.getAttribute('position').array);assert.ok(g.index.count/3<30000);for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getY(i)));assert.ok(Math.hypot(p.getX(i),p.getZ(i))>119);assert.ok(p.getY(i)<35);assert.ok(n.getY(i)>0)}g.dispose();again.dispose()}});
test('meadow is seeded, grounded and excludes infrastructure and station sight clearance',()=>{const p=meadowPoints();assert.equal(p.length,4500);assert.deepEqual(p,meadowPoints());for(const a of p){assert.equal(a.y,sampleTerrainHeight(a.x,a.z));assert.ok(!infrastructureExcluded(a.x,a.z,.35));assert.ok(NODE_ANCHORS.every(n=>Math.hypot(n.position.x-a.x,n.position.z-a.z)>=4))}});
