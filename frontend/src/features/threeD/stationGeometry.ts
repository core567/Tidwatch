import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute,
  Matrix4, Quaternion, Vector3, PlaneGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleRiverAtX, sampleTerrainHeight, type NodeAnchor } from './riverGeometry.ts';
import { SCENE_CONFIG } from './sceneConfig.ts';

export type StationSurface = 'concrete' | 'metal' | 'enamel' | 'glass';
type Point = [number, number, number];
const UP = new Vector3(0, 1, 0);

/** Local +Z faces the actual shoreline, including its deposited/cut-bank shift. */
export function stationLayout(anchor: NodeAnchor) {
  const p = anchor.position, section = sampleRiverAtX(p.x);
  const side = anchor.bankSide ?? (p.z < section.z ? -1 : 1);
  const shoreAt = (x: number) => {
    const s = sampleRiverAtX(x);
    return new Vector3(x, 0, side < 0 ? s.leftBankZ : s.rightBankZ);
  };
  const distance = (x: number) => {
    const shore = shoreAt(x);
    return (shore.x - p.x) ** 2 + (shore.z - p.z) ** 2;
  };
  let low = p.x - 3, high = p.x + 3;
  for (let i = 0; i < 32; i++) {
    const a = low + (high - low) / 3, b = high - (high - low) / 3;
    if (distance(a) < distance(b)) high = b; else low = a;
  }
  const shore = shoreAt((low + high) / 2);
  const waterward = new Vector3(shore.x - p.x, 0, shore.z - p.z).normalize();
  const along = new Vector3(waterward.z, 0, -waterward.x);
  const basis = new Matrix4().makeBasis(along, UP, waterward);
  const world = (x: number, z: number) => p.clone().addScaledVector(along, x).addScaledVector(waterward, z);
  const ground = (x: number, z: number) => {
    const q = world(x, z);
    return sampleTerrainHeight(q.x, q.z) - p.y;
  };
  const deckTop = Math.max(...[-.7, 0, .7].flatMap(x => [-.75, 0, .75].map(z => ground(x, z)))) + .26;
  const feet = [-.53, .53].flatMap(x => [-.57, .57].map(z => {
    const heights = [-.13, .13].flatMap(dx => [-.13, .13].map(dz => ground(x + dx, z + dz)));
    return { x, z, bottom: Math.min(...heights) - .04, top: Math.max(...heights) + .05 };
  }));
  const shoreDistance = Math.hypot(shore.x - p.x, shore.z - p.z);
  const staffDistance = shoreDistance + .1;
  const staffWorld = world(0, staffDistance);
  const waterY = SCENE_CONFIG.waterLevel - p.y;
  return { basis, world, deckTop, feet, staffDistance, staffWorld, waterY,
    lamp: new Vector3(.37, deckTop + 1.63, .18).applyMatrix4(basis) };
}

/** Four opaque draw calls for the platform and equipment; colors are baked per part. */
export function buildStationGeometry(anchor: NodeAnchor) {
  const layout = stationLayout(anchor), d = layout.deckTop;
  const parts: Record<StationSurface, BufferGeometry[]> = { concrete: [], metal: [], enamel: [], glass: [] };
  const add = (geometry: BufferGeometry, color: string, surface: StationSurface) => {
    const c = new Color(color), count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv'); parts[surface].push(geometry);
  };
  const box = (x: number, y: number, z: number, w: number, h: number, depth: number,
    color: string, surface: StationSurface = 'metal', tilt = 0) =>
    add(new BoxGeometry(w, h, depth).rotateX(tilt).translate(x, y, z), color, surface);
  const rod = (a: Point, b: Point, radius = .025, color = '#8c9c99', surface: StationSurface = 'metal') => {
    const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
    const geometry = new CylinderGeometry(radius, radius, delta.length(), 8);
    geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, delta.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
    add(geometry, color, surface);
  };
  const cylinder = (x: number, y: number, z: number, radius: number, height: number,
    color: string, surface: StationSurface = 'metal') =>
    add(new CylinderGeometry(radius, radius, height, 12).translate(x, y, z), color, surface);

  box(0, d - .09, 0, 1.4, .18, 1.5, '#c3c3b6', 'concrete');
  box(0, d - .015, 0, 1.32, .035, 1.42, '#d6d5c6', 'concrete');
  for (const foot of layout.feet) {
    box(foot.x, (foot.bottom + foot.top) / 2, foot.z, .27, foot.top - foot.bottom, .27, '#aaa995', 'concrete');
    const top = d - .17;
    cylinder(foot.x, (foot.top + top) / 2, foot.z, .065, top - foot.top, '#637572');
    box(foot.x, top, foot.z, .18, .035, .18, '#88938c');
  }
  const stepBottom = Math.min(...[-.285, .285].flatMap(x => [-.965, -.695].map(z => {
    const p = layout.world(x, z);
    return sampleTerrainHeight(p.x, p.z) - anchor.position.y;
  }))) - .04;
  box(0, (d + stepBottom) / 2 - .07, -.83, .57, d - stepBottom - .14, .27, '#b4b6a9', 'concrete');
  box(0, d - .135, -.83, .57, .025, .27, '#d2cfb7', 'concrete');

  // Recessed non-slip strips remain below the maintenance deck. 
  for (const z of [-.9, -.81, -.72]) box(0, d - .119, z, .49, .009, .022, '#65716b');

  // Rounded enclosure, door gasket, drip cap, hinge barrels, latch and cooling slots.
  box(-.24, d + .08, -.12, .49, .16, .39, '#284655');
  add(new RoundedBoxGeometry(.62, .84, .48, 2, .035).translate(-.24, d + .57, -.12), '#d9dfd8', 'enamel');
  box(-.24, d + .57, -.365, .54, .74, .016, '#284653');
  box(-.24, d + .57, -.377, .5, .7, .018, '#e1e4d9', 'enamel');
  box(-.24, d + 1.015, -.13, .7, .06, .57, '#365765');
  for (const h of [.32, .79]) cylinder(-.48, d + h, -.395, .02, .11, '#879995');
  box(-.05, d + .6, -.395, .025, .15, .035, '#405854');
  for (let i = 0; i < 4; i++) box(-.24, d + .29 + i * .044, -.39, .28, .014, .01, '#536c68', 'glass');
  const stripe = anchor.reachId === 'reach-b' ? '#48878b' : anchor.reachId === 'reach-c' ? '#517d8d' : '#468a89';
  const letters: Record<string, number[][]> = {
    'reach-a': [[-.05, -.045, 0, .045], [0, .045, .05, -.045], [-.027, -.008, .027, -.008]],
    'reach-b': [[-.04, -.05, -.04, .05], [-.04, .05, .03, .03], [.03, .03, -.04, 0], [-.04, 0, .04, -.025], [.04, -.025, -.04, -.05]],
    'reach-c': [[.04, .045, -.04, .045], [-.04, .045, -.04, -.045], [-.04, -.045, .04, -.045]],
  };
  for (const face of [-1, 1]) {
    const z = face < 0 ? -.398 : .127;
    box(-.24, d + .78, z, .35, .16, .014, '#243f50', 'glass');
    box(-.24, d + .65, z, .49, .036, .016, stripe, 'enamel');
    for (const [x1, y1, x2, y2] of letters[anchor.reachId] ?? letters['reach-a'])
      rod([-.24 + x1 * face, d + .78 + y1, z + face * .013],
        [-.24 + x2 * face, d + .78 + y2, z + face * .013], .007, '#e8eeeb', 'enamel');
  }

  // A low navy plinth and narrow service strip unify the station family without extra sign text.
  box(-.24, d + .19, -.391, .5, .045, .012, '#2e4b5a', 'enamel');
  box(-.24, d + .895, -.391, .49, .022, .012, '#829d9c', 'enamel');

  // Frame and supports are geometry; the cell grid is a replaceable 1K texture.
  const tilt = -.36, panelY = d + 1.3, panelZ = -.11;
  rod([-.43, d + 1.04, -.22], [-.43, panelY + .055, -.22], .022);
  rod([-.07, d + 1.04, -.22], [-.07, panelY + .055, -.22], .022);
  box(-.25, panelY, panelZ, .82, .055, .56, '#95a5a3', 'metal', tilt);
  const solar=new PlaneGeometry(.77,.51).rotateX(-Math.PI/2+tilt)
    .translate(-.25,panelY+.034*Math.cos(tilt),panelZ+.034*Math.sin(tilt));
  solar.applyMatrix4(layout.basis);solar.computeBoundingSphere();

  // Three-sided safety rail with a landward access opening.
  for (const x of [-.64, .64]) {
    for (const z of [-.66, .04, .66]) {
      rod([x, d, z], [x, d + .65, z], .022);
      box(x, d + .014, z, .1, .025, .1, '#697f79');
    }
    for (const h of [.32, .64]) rod([x, d + h, -.66], [x, d + h, .66], .019);
  }
  for (const h of [.32, .64]) rod([-.64, d + h, .66], [.64, d + h, .66], .019);
  for (const x of [-.64, .64]) box(x, d + .08, 0, .035, .08, 1.31, '#a4a283', 'enamel');

  // Instrument mast, cable conduit and braced radar arm terminate above water.
  const mastX = .37, mastZ = .18, boomY = d + 1.78;
  box(mastX, d + .035, mastZ, .22, .07, .22, '#768c88');
  cylinder(mastX, d + .97, mastZ, .038, 1.86, '#9aaba7');
  for (const x of [-.07, .07]) for (const z of [-.07, .07])
    cylinder(mastX + x, d + .08, mastZ + z, .012, .028, '#d0d3bd');
  rod([mastX - .055, d + .18, mastZ], [mastX - .055, d + 1.6, mastZ], .013, '#3c5351');
  for (const h of [.45, 1.18]) box(mastX - .025, d + h, mastZ, .13, .035, .075, '#698081');
  rod([mastX, boomY, mastZ], [0, boomY, layout.staffDistance], .032);
  rod([mastX, d + 1.27, mastZ], [.12, boomY, layout.staffDistance * .66], .021);
  cylinder(0, boomY - .065, layout.staffDistance, .075, .15, '#e1e2d2', 'enamel');
  cylinder(0, boomY - .145, layout.staffDistance, .063, .025, '#304c53', 'glass');

  const staffTop = layout.waterY + .84, staffBottom = layout.waterY - .15;
  box(0, (staffTop + staffBottom) / 2, layout.staffDistance, .12, staffTop - staffBottom, .04, '#e4e1cb', 'enamel');
  for (let i = 0; i < 9; i++) {
    const y = layout.waterY - .1 + i * .105;
    for (const face of [-1, 1]) box(i % 2 ? -.022 : 0, y, layout.staffDistance + face * .024,
      i % 2 ? .07 : .11, .036, .012, '#9e594b', 'enamel');
  }
  rod([0, d + .12, .65], [0, staffTop - .05, layout.staffDistance], .021);
  rod([-.36, d + .02, .65], [0, staffTop - .28, layout.staffDistance], .015, '#81958e');

  // Radio aerial and compact GNSS receiver keep station silhouettes distinct.
  cylinder(mastX, d + 1.98, mastZ, .023, .26, '#718a87');
  cylinder(mastX, d + 2.115, mastZ, .042, .055, '#d3dbd1', 'enamel');
  rod([mastX, d + 1.89, mastZ], [mastX + .15, d + 1.89, mastZ], .018);
  cylinder(mastX + .15, d + 2.02, mastZ, .012, .27, '#3d5555');
  if (anchor.reachId === 'reach-b')
    box(mastX - .02, d + 1.38, mastZ - .07, .19, .25, .12, '#d2d8ce', 'enamel');
  else if (anchor.reachId === 'reach-c')
    cylinder(-.51, d + 1.11, -.12, .075, .12, '#d5d9ce', 'enamel');

  const geometry = Object.fromEntries(Object.entries(parts).map(([surface, list]) => {
    // RoundedBoxGeometry is non-indexed; normalize the primitives once before merging.
    const normalized = list.map(part => part.index ? part.toNonIndexed() : part);
    const merged = mergeGeometries(normalized)!;
    for (const item of new Set([...list, ...normalized])) item.dispose();
    merged.applyMatrix4(layout.basis);
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    return [surface, merged];
  })) as Record<StationSurface, BufferGeometry>;
  const outline = new BufferGeometry(), points: number[] = [];
  for (const [a, b] of [[[-.71, -.76], [.71, -.76]], [[.71, -.76], [.71, .76]],
    [[.71, .76], [-.71, .76]], [[-.71, .76], [-.71, -.76]]])
    points.push(a[0], d + .012, a[1], b[0], d + .012, b[1]);
  outline.setAttribute('position', new Float32BufferAttribute(points, 3));
  outline.applyMatrix4(layout.basis);
  return { geometry, outline, layout, solar };
}
