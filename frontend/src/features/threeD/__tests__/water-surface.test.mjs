import test from 'node:test';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { buildValleyGeometry, sampleTerrainHeight, NODE_ANCHORS } from '../riverGeometry.ts';
import { buildWaterSurface, clampDemoWaterLevel, WATER_DEMO_RANGE } from '../waterSurface.ts';

test('water demo rejects invalid input and bounds logical offsets independently of monitoring values', () => {
  assert.equal(clampDemoWaterLevel(NaN),0); assert.equal(clampDemoWaterLevel(Infinity),0);
  assert.equal(clampDemoWaterLevel(-2),WATER_DEMO_RANGE.min);
  assert.equal(clampDemoWaterLevel(2),WATER_DEMO_RANGE.max);
  assert.equal(clampDemoWaterLevel(.075),.075);
});

test('adjustable water reuses actual bed triangles and excludes dry distant ground', () => {
  const ground=buildValleyGeometry(),water=buildWaterSurface(ground);
  const p=water.getAttribute('position'),bed=water.getAttribute('bedHeight'),normal=water.getAttribute('normal');
  assert.ok(p.count>1000 && p.count<30000,'water uses only the channel and reachable shallow margins');
  for(let i=0;i<p.count;i++) {
    assert.equal(p.getY(i),0);assert.ok(Number.isFinite(p.getX(i)+p.getZ(i)+bed.getX(i)));
    assert.ok(Math.abs(sampleTerrainHeight(p.getX(i),p.getZ(i))-bed.getX(i))<1e-5);
    assert.ok(normal.getY(i)>.999);
  }
  for(const index of water.index.array)assert.ok(index<p.count);
  ground.dispose();water.dispose();
});

test('rising and falling waterline intersects rendered bank triangles without a separate shoreline approximation', () => {
  const ground=buildValleyGeometry(),water=buildWaterSurface(ground),p=water.getAttribute('position'),b=water.getAttribute('bedHeight');
  for(const level of [-.12,0,.12]) {
    let crossings=0;
    for(let i=0;i<water.index.count;i+=3) {
      const ids=[water.index.getX(i),water.index.getX(i+1),water.index.getX(i+2)];
      for(let j=0;j<3;j++) {
        const a=ids[j],c=ids[(j+1)%3],ya=b.getX(a),yc=b.getX(c);
        if((ya<level && yc>=level)||(yc<level && ya>=level)) {
          const t=(level-ya)/(yc-ya),x=p.getX(a)+(p.getX(c)-p.getX(a))*t,z=p.getZ(a)+(p.getZ(c)-p.getZ(a))*t;
          assert.ok(Math.abs(sampleTerrainHeight(x,z)-level)<.00002,'exact triangle waterline');crossings++;
        }
      }
    }
    assert.ok(crossings>500,'continuous bank coverage at level '+level);
  }
  for(const anchor of NODE_ANCHORS)assert.ok(anchor.position.y>WATER_DEMO_RANGE.max,'demo does not flood station foundations');
  ground.dispose();water.dispose();
});

test('every main-channel bed triangle is present and water interior height agrees with ground sampling', () => {
  const ground=buildValleyGeometry(), water=buildWaterSurface(ground),p=water.getAttribute('position'),b=water.getAttribute('bedHeight');
  const point=(attr,id)=>`${attr.getX(id)},${attr.getZ(id)}`;
  const key=(attr,ids)=>ids.map(id=>point(attr,id)).sort().join('|');
  const triangles=new Set();
  for(let i=0;i<water.index.count;i+=3) {
    const ids=[water.index.getX(i),water.index.getX(i+1),water.index.getX(i+2)];
    triangles.add(key(p,ids));
    const x=ids.reduce((sum,id)=>sum+p.getX(id),0)/3,z=ids.reduce((sum,id)=>sum+p.getZ(id),0)/3;
    assert.ok(Math.abs(sampleTerrainHeight(x,z)-ids.reduce((sum,id)=>sum+b.getX(id),0)/3)<.00001);
  }
  const gp=ground.getAttribute('position');
  for(let i=0;i<ground.index.count;i+=3) {
    const ids=[ground.index.getX(i),ground.index.getX(i+1),ground.index.getX(i+2)];
    if(ids.some(id=>gp.getY(id)<=0))assert.ok(triangles.has(key(gp,ids)),'no missing connected main-channel triangle');
  }
  assert.ok(water.boundingBox.min.y<=WATER_DEMO_RANGE.min && water.boundingBox.max.y>=WATER_DEMO_RANGE.max);
  ground.dispose();water.dispose();
});

test('a shallow depression behind a higher bank does not fill merely because its floor is low', () => {
  const {BufferGeometry,Float32BufferAttribute}=THREE;
  const terrain=new BufferGeometry();
  terrain.setAttribute('position',new Float32BufferAttribute([
    -1,-.5,-1, 0,.2,-1, 1,.04,-1,
    -1,-.5,1, 0,.2,1, 1,.04,1,
  ],3));
  terrain.setIndex([0,3,1,1,3,4,1,4,2,2,4,5]);
  const water=buildWaterSurface(terrain),p=water.getAttribute('position');
  assert.ok(p.count>0);
  for(let i=0;i<p.count;i++)assert.ok(p.getX(i)<=0,'disconnected low pocket behind +.2 bank remains dry');
  terrain.dispose();water.dispose();
});
