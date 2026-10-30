import test from 'node:test';
import assert from 'node:assert/strict';
import * as river from '../riverGeometry.ts';

function checkGeometry(geometry) {
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  const indices = geometry.getIndex();
  assert.ok(p.count > 3);
  assert.ok(p.count < 100000, 'bounded mesh allocation');
  for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]));
  for (const index of indices.array) assert.ok(index >= 0 && index < p.count);
  for (let i = 0; i < n.count; i++) assert.ok(n.getY(i) > 0, `upward normal at ${i}`);
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    const signedArea = (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)) - (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a));
    assert.ok(signedArea > 1e-9, 'no inverted or collapsed projected triangles');
  }
}

test('water and low-relief terrain contain finite, consistently oriented triangles', () => {
  const water = river.buildWaterGeometry(river.RIVER_CURVE, river.WATER_WIDTH);
  const terrain = river.buildValleyGeometry();
  checkGeometry(water);
  checkGeometry(terrain);
  const p = terrain.getAttribute('position');
  let max = -Infinity;
  for (let i = 0; i < p.count; i++) max = Math.max(max, p.getY(i));
  assert.ok(max < 9, 'plain river valley does not become a high canyon');
  water.dispose(); terrain.dispose();
});

test('geometry is byte-for-byte deterministic and has varied earth colors', () => {
  const a = river.buildValleyGeometry(), b = river.buildValleyGeometry();
  assert.deepEqual(a.getAttribute('position').array, b.getAttribute('position').array);
  assert.deepEqual(a.getAttribute('color').array, b.getAttribute('color').array);
  const c = a.getAttribute('color');
  const colors = new Set();
  for (let i = 0; i < c.count; i += 13) colors.add(`${c.getX(i).toFixed(3)},${c.getY(i).toFixed(3)},${c.getZ(i).toFixed(3)}`);
  assert.ok(colors.size > 100);
  a.dispose(); b.dispose();
});

test('river width is positive, bounded, continuously varied', () => {
  assert.equal(typeof river.getRiverWidth, 'function');
  const widths = Array.from({ length: 1001 }, (_, i) => river.getRiverWidth(i / 1000));
  assert.ok(Math.min(...widths) >= 4 && Math.max(...widths) <= 7);
  assert.ok(Math.max(...widths) - Math.min(...widths) > 0.8);
  for (let i = 1; i < widths.length; i++) assert.ok(Math.abs(widths[i] - widths[i - 1]) < 0.025);
});

test('every water shoreline vertex is an exact shared terrain vertex at water level', () => {
  const water = river.buildWaterGeometry(river.RIVER_CURVE, river.WATER_WIDTH);
  const terrain = river.buildValleyGeometry();
  const wp = water.getAttribute('position'), tp = terrain.getAttribute('position');
  const shoreline = new Set();
  for (let i = 0; i < tp.count; i++) if (tp.getY(i) === 0) shoreline.add(`${tp.getX(i)},${tp.getZ(i)}`);
  const cols = 7;
  for (let i = 0; i < wp.count; i += cols) {
    for (const edge of [i, i + cols - 1]) {
      assert.equal(wp.getY(edge), 0, 'water edge is pinned to Y=0');
      assert.ok(shoreline.has(`${wp.getX(edge)},${wp.getZ(edge)}`), 'no independent shoreline approximation');
    }
  }
  assert.ok(Math.abs(wp.getX(0)) > 95, 'water continues beyond main reach');
  water.dispose(); terrain.dispose();
});

test('height sampler agrees with rendered mesh vertices and river bed stays submerged', () => {
  assert.equal(typeof river.sampleTerrainHeight, 'function');
  const terrain = river.buildValleyGeometry(), p = terrain.getAttribute('position');
  for (let i = 0; i < p.count; i += 17) {
    assert.ok(Math.abs(river.sampleTerrainHeight(p.getX(i), p.getZ(i)) - p.getY(i)) < 0.0001);
  }
  for (let i = 0; i <= 100; i++) {
    const c = river.RIVER_CURVE.getPointAt(i / 100);
    assert.ok(river.sampleTerrainHeight(c.x, c.z) < -0.2);
  }
  terrain.dispose();
});

test('ABC anchors preserve IDs and order while standing on sampled dry ground', () => {
  assert.deepEqual(river.NODE_ANCHORS.map(a => a.reachId), ['reach-a', 'reach-b', 'reach-c']);
  assert.deepEqual(river.NODE_ANCHORS.map(a => a.t), [0.12, 0.5, 0.88]);
  assert.equal(typeof river.sampleTerrainHeight, 'function');
  for (const a of river.NODE_ANCHORS) {
    assert.ok(a.position.y > 0);
    assert.ok(Math.abs(a.position.y - river.sampleTerrainHeight(a.position.x, a.position.z)) < 1e-6);
    const center = river.RIVER_CURVE.getPointAt(a.t);
    assert.ok(Math.hypot(a.position.x - center.x, a.position.z - center.z) > river.getRiverWidth(a.t) / 2);
  }
});

test('legacy generic geometry builders remain pure and face upward', () => {
  const ribbon = river.buildRibbonGeometry(river.RIVER_CURVE, 3, 0, 30);
  const bank = river.buildBankGeometry(river.RIVER_CURVE, 4.6, 13, -1, 30);
  checkGeometry(ribbon); checkGeometry(bank);
  ribbon.dispose(); bank.dispose();
});


test('height sampler agrees inside both triangle halves, not only at vertices', () => {
  const terrain = river.buildValleyGeometry();
  const p = terrain.getAttribute('position'), indices = terrain.getIndex();
  for (let i = 0; i < indices.count; i += 177) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    for (const weights of [[0.2, 0.3, 0.5], [0.6, 0.15, 0.25]]) {
      const weighted = axis => weights[0] * p.array[a * 3 + axis] + weights[1] * p.array[b * 3 + axis] + weights[2] * p.array[c * 3 + axis];
      assert.ok(Math.abs(river.sampleTerrainHeight(weighted(0), weighted(2)) - weighted(1)) < 0.00001);
    }
  }
  terrain.dispose();
});

test('near-bank terrain has discernible irregular terrace slopes and diverse material regions', () => {
  assert.equal(typeof river.sampleRiverSection, 'function');
  let steepSections = 0;
  for (const t of [0.15, 0.3, 0.5, 0.7, 0.85]) {
    const s = river.sampleRiverSection(t);
    let maxSlope = 0;
    for (let d = 2; d < 10; d += 0.5) {
      const z = s.z - s.width / 2 - d;
      const slope = Math.abs(river.sampleTerrainHeight(s.x, z - 0.25) - river.sampleTerrainHeight(s.x, z + 0.25)) / 0.5;
      maxSlope = Math.max(maxSlope, slope);
    }
    if (maxSlope > 0.25) steepSections++;
  }
  assert.ok(steepSections >= 3, 'readable smooth terrace scarps along multiple reach sections');
  const terrain = river.buildValleyGeometry(), c = terrain.getAttribute('color'), p = terrain.getAttribute('position');
  let minLight = Infinity, maxLight = -Infinity;
  for (let i = 0; i < c.count; i++) {
    if (Math.abs(p.getX(i)) > 38 || Math.abs(p.getZ(i)) > 30 || p.getY(i) < 0.1) continue;
    const section = river.sampleRiverSection(Math.max(0, Math.min(1, (p.getX(i) + 38) / 76)));
    const dist = Math.abs(p.getZ(i) - section.z) - section.width / 2;
    if (dist < 4 || dist > 22) continue;
    const light = (c.getX(i) + c.getY(i) + c.getZ(i)) / 3;
    minLight = Math.min(minLight, light); maxLight = Math.max(maxLight, light);
  }
  // Sand and wet silt now mix in the fragment shader; base vertex colors describe vegetation/soil.
  assert.ok(maxLight - minLight > 0.08, 'vegetated soil retains low-frequency material variation');
  const surface = terrain.getAttribute('terrainSurface');
  assert.equal(surface.count, p.count);
  let sandMin = 1, sandMax = 0;
  for (let i = 0; i < surface.count; i++) {
    assert.ok(Number.isFinite(surface.getX(i)));
    for (const value of [surface.getY(i), surface.getZ(i)]) assert.ok(value >= 0 && value <= 1);
    if (Math.abs(p.getX(i)) < 38 && surface.getX(i) > 0 && surface.getX(i) < 8) {
      sandMin = Math.min(sandMin, surface.getY(i)); sandMax = Math.max(sandMax, surface.getY(i));
    }
  }
  assert.ok(sandMin < 0.05 && sandMax > 0.95, 'shore shader receives both grass-dominant and sediment-dominant regions');
  terrain.dispose();
});

test('cross-sections project true river width and keep unequal banks through bends', () => {
  assert.equal(typeof river.sampleRiverAtX, 'function');
  let asymmetricSections = 0;
  for (const t of [0.12, 0.25, 0.4, 0.55, 0.7, 0.88]) {
    const center = river.RIVER_CURVE.getPointAt(t);
    const tangent = river.RIVER_CURVE.getTangentAt(t);
    const s = river.sampleRiverAtX(center.x);
    assert.ok(Math.abs(s.z - center.z) < 0.002);
    assert.ok(Math.abs(s.normalWidth - river.getRiverWidth(t)) < 0.002);
    assert.ok(Math.abs((s.rightBankZ - s.leftBankZ) * tangent.x - s.normalWidth) < 0.025,
      'width is measured perpendicular to flow, rather than shrinking on diagonal reaches');
    if (Math.abs((s.z - s.leftBankZ) - (s.rightBankZ - s.z)) > 0.2) asymmetricSections++;
  }
  assert.ok(asymmetricSections >= 4, 'deposition and erosion do not produce parallel symmetric shorelines');
});

test('surface context identifies submerged bed, dry banks, slope and bend deposition', () => {
  assert.equal(typeof river.sampleSurfaceContext, 'function');
  let broadBars = 0;
  for (const t of [0.22, 0.33, 0.55, 0.68, 0.8]) {
    const s = river.sampleRiverSection(t);
    const bed = river.sampleSurfaceContext(s.x, s.z);
    assert.ok(bed.bankDistance < -1 && bed.height < 0);
    const innerSide = s.curvature > 0 ? 1 : -1;
    const innerShore = innerSide > 0 ? s.rightBankZ : s.leftBankZ;
    const outerShore = innerSide > 0 ? s.leftBankZ : s.rightBankZ;
    const inner = river.sampleSurfaceContext(s.x, innerShore + innerSide * 2.4 / s.tangentX);
    const outer = river.sampleSurfaceContext(s.x, outerShore - innerSide * 2.4 / s.tangentX);
    assert.ok(inner.bankDistance > 2.3 && inner.bankDistance < 2.5);
    assert.ok(inner.height > 0 && outer.height > 0, 'both banks stay above water');
    assert.ok(inner.slope >= 0 && inner.slope < 1 && outer.slope >= 0 && outer.slope < 1);
    if (inner.innerBend > 0.45 && inner.sand > outer.sand + 0.25 && inner.height < outer.height - 0.2) broadBars++;
  }
  assert.ok(broadBars >= 2, 'inner bends have low sandy point bars opposite raised cut banks');
});

test('water flow follows the rendered displaced channel, including its endpoint rows', () => {
  const water = river.buildWaterGeometry(river.RIVER_CURVE, river.WATER_WIDTH);
  const p = water.getAttribute('position'), flow = water.getAttribute('flowDirection');
  assert.ok(flow && flow.itemSize === 2 && flow.count === p.count);
  const cols = 7, rows = p.count / cols;
  const centerZ = row => (p.getZ(row * cols) + p.getZ(row * cols + cols - 1)) / 2;
  for (let row = 0; row < rows; row++) {
    const before = Math.max(0, row - 1), after = Math.min(rows - 1, row + 1);
    const dx = p.getX(after * cols) - p.getX(before * cols), dz = centerZ(after) - centerZ(before);
    for (const col of [0, 3, 6]) {
      const i = row * cols + col;
      assert.ok(Math.abs(Math.hypot(flow.getX(i), flow.getY(i)) - 1) < 1e-6);
      assert.ok((flow.getX(i) * dx + flow.getY(i) * dz) / Math.hypot(dx, dz) > 0.9999,
        `flow follows actual mesh centers at X=${p.getX(i)}`);
    }
  }
  water.dispose();
});


test('hidden channel extensions join the visible reach without a shoreline step', () => {
  for (const x of [-38, 38]) {
    const before = river.sampleRiverAtX(x - 0.001), at = river.sampleRiverAtX(x), after = river.sampleRiverAtX(x + 0.001);
    for (const key of ['z', 'leftBankZ', 'rightBankZ']) {
      assert.ok(Math.abs(before[key] - at[key]) < 0.01, `${key} continuity before ${x}`);
      assert.ok(Math.abs(after[key] - at[key]) < 0.01, `${key} continuity after ${x}`);
    }
  }
});


test('bend effects do not form a transverse ridge across distant terrain', () => {
  for (let x = -6; x <= 0; x += 0.25) {
    for (const z of [40, 60, 80]) {
      const slope = Math.abs(river.sampleTerrainHeight(x + 0.25, z) - river.sampleTerrainHeight(x - 0.25, z)) / 0.5;
      assert.ok(slope < 0.3, `distant valley remains gently rolling at ${x},${z}`);
    }
  }
});

test('shorelines turn smoothly instead of snapping at spline control points', () => {
  const water = river.buildWaterGeometry(river.RIVER_CURVE, river.WATER_WIDTH);
  const p = water.getAttribute('position'), cols = 7;
  for (let i = cols; i < p.count - cols; i += cols) {
    if (Math.abs(p.getX(i)) > 36) continue;
    for (const bank of [0, 6]) {
      const before = Math.atan2(p.getZ(i + bank) - p.getZ(i - cols + bank), p.getX(i) - p.getX(i - cols));
      const after = Math.atan2(p.getZ(i + cols + bank) - p.getZ(i + bank), p.getX(i + cols) - p.getX(i));
      assert.ok(Math.abs(after - before) < 0.14, `shoreline has no angular notch at X=${p.getX(i)}`);
    }
  }
  water.dispose();
});

test('natural-scene refinements preserve the accepted ABC world anchors', () => {
  const positions = [
    [-29.177059681732448, 0.33147888223995753, -8.376174927256079],
    [0.2190816953502899, 0.5779119848204157, 6.417500707452872],
    [30.06938242644058, 0.5683610875831067, -3.162535568866421],
  ];
  river.NODE_ANCHORS.forEach((anchor, i) => {
    const actual = anchor.position.toArray();
    actual.forEach((coordinate, axis) => assert.ok(Math.abs(coordinate - positions[i][axis]) < 1e-9,
      `${anchor.reachId} remains in its accepted location`));
  });
});
