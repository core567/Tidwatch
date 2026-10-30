import * as THREE from 'three';
import { CatmullRomCurve3, Vector3 } from 'three';
import { SCENE_CONFIG } from './sceneConfig.ts';

/** Fixed, schematic local centerline; it is not a geographic reconstruction. */
export const RIVER_CURVE = new CatmullRomCurve3([
  new Vector3(-38, 0, -8),
  new Vector3(-27, 0, -2),
  new Vector3(-15, 0, 4.5),
  new Vector3(-3, 0, 3.3),
  new Vector3(10, 0, -2.4),
  new Vector3(25, 0, -1),
  new Vector3(38, 0, 8),
], false, 'centripetal');
export const WATER_WIDTH = SCENE_CONFIG.waterWidth;
export const BANK_WIDTH = 13;
export const RIBBON_SEGMENTS = SCENE_CONFIG.longitudinalSegments;

const clamp = (v: number, low = 0, high = 1) => Math.max(low, Math.min(high, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (low: number, high: number, value: number) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};

/** Width perpendicular to flow. X-row geometry projects it using the local tangent. */
export function getRiverWidth(t: number): number {
  return 5.25 + 0.65 * Math.sin(t * 6.7 + 0.4)
    + 0.34 * Math.sin(t * 13.1 - 1.1) + 0.12 * Math.sin(t * 31 + 0.6);
}

export interface RiverSection {
  x: number; z: number; t: number;
  /** X-row span retained for existing callers; normalWidth is perpendicular to flow. */
  width: number; normalWidth: number;
  tangentX: number; tangentZ: number; curvature: number;
  leftBankZ: number; rightBankZ: number;
}

// Curve allocations happen once, never in the height-field inner loop or per frame.
const rawCenterSamples = Array.from({ length: 1025 }, (_, i) => {
  const t = i / 1024;
  const point = RIVER_CURVE.getPointAt(t), tangent = RIVER_CURVE.getTangentAt(t);
  const before = RIVER_CURVE.getTangentAt(clamp(t - 0.012));
  const after = RIVER_CURVE.getTangentAt(clamp(t + 0.012));
  const length = RIVER_CURVE.getLength() * (clamp(t + 0.012) - clamp(t - 0.012));
  const curvature = (before.x * after.z - before.z * after.x) / length;
  return { point, tangent, curvature, t };
});
// Catmull-Rom curvature changes at control points; geomorphic response averages a short reach.
const centerSamples = rawCenterSamples.map((sample, index) => {
  let total = 0, weightSum = 0;
  for (let i = Math.max(0, index - 96); i <= Math.min(1024, index + 96); i++) {
    const distance = (i - index) / 1024 * RIVER_CURVE.getLength();
    const weight = Math.exp(-0.5 * (distance / 2.6) ** 2);
    total += rawCenterSamples[i].curvature * weight;
    weightSum += weight;
  }
  return { ...sample, curvature: total / weightSum };
});
const first = centerSamples[0].point;
const last = centerSamples[centerSamples.length - 1].point;
const startSlope = centerSamples[0].tangent;
const endSlope = centerSamples[centerSamples.length - 1].tangent;

function riverSection(x: number, z: number, t: number, slope: number, curvature: number): RiverSection {
  const tangentX = 1 / Math.hypot(1, slope), tangentZ = slope * tangentX;
  const normalWidth = getRiverWidth(t), width = normalWidth / tangentX;
  const bend = Math.tanh(curvature * 24);
  // Deposition displaces the channel toward the cut bank; gentle scallops break parallel edges.
  const shift = (-bend * 0.62 + Math.sin(t * 22 + 0.8) * 0.27
    + Math.sin(t * 41 - 1) * 0.09) / tangentX;
  return { x, z, t, width, normalWidth, tangentX, tangentZ, curvature,
    leftBankZ: z - width / 2 + shift, rightBankZ: z + width / 2 + shift };
}

export function sampleRiverAtX(x: number): RiverSection {
  if (x <= first.x || x >= last.x) {
    const before = x <= first.x;
    const p = before ? first : last;
    const tangent = before ? startSlope : endSlope;
    const distance = x - p.x, decay = Math.exp(-Math.abs(distance) / 40);
    const extensionSlope = tangent.z / tangent.x;
    // Continue position and tangent beyond the main reach, hiding the water end caps.
    const z = p.z + extensionSlope * distance * (0.65 + 0.35 * decay);
    const slope = extensionSlope * (0.65 + 0.35 * decay * (1 - Math.abs(distance) / 40));
    const curvature = centerSamples[before ? 0 : centerSamples.length - 1].curvature * decay;
    return riverSection(x, z, (x - first.x) / (last.x - first.x), slope, curvature);
  }
  let low = 0, high = centerSamples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (centerSamples[mid].point.x < x) low = mid;
    else high = mid;
  }
  const a = centerSamples[low], b = centerSamples[high];
  const k = (x - a.point.x) / (b.point.x - a.point.x);
  return riverSection(x, mix(a.point.z, b.point.z, k), mix(a.t, b.t, k),
    mix(a.tangent.z / a.tangent.x, b.tangent.z / b.tangent.x, k), mix(a.curvature, b.curvature, k));
}

export function sampleRiverSection(t: number): RiverSection {
  return sampleRiverAtX(RIVER_CURVE.getPointAt(clamp(t)).x);
}

function hash(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7 + SCENE_CONFIG.seed) * 43758.5453;
  return h - Math.floor(h);
}
function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), u),
    mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
function noise(x: number, z: number): number {
  return valueNoise(x, z) * 0.57 + valueNoise(x * 2.13 + 11, z * 2.13 - 7) * 0.28
    + valueNoise(x * 4.27 - 3, z * 4.27 + 19) * 0.15;
}

function bankContext(x: number, z: number, section: RiverSection) {
  const side = z < section.z ? -1 : 1;
  const shore = side < 0 ? section.leftBankZ : section.rightBankZ;
  const bankDistance = (z - shore) * side * section.tangentX;
  const bend = Math.tanh(section.curvature * 24);
  const innerBend = Math.max(0, bend * side), outerBend = Math.max(0, -bend * side);
  const patch = noise(x * 0.12 + 8, z * 0.12);
  const barWidth = (0.42 + innerBend * 4.8) * (0.68 + patch * 0.85);
  const sand = 1 - smooth(barWidth * 0.24, barWidth + 0.72, bankDistance);
  const woodland = smooth(3, 10, bankDistance) * smooth(0.32, 0.68, noise(x * 0.049 - 17, z * 0.057 + 3));
  return { side, bankDistance, innerBend, outerBend, sand, woodland };
}

function terrainHeight(x: number, z: number, section: RiverSection): number {
  const offset = z - section.z;
  const { side, bankDistance, innerBend, outerBend } = bankContext(x, z, section);
  // Only near-shore slopes use local normal distance; hills must not inherit tangent changes.
  const distance = mix(bankDistance, bankDistance / section.tangentX, smooth(8, 24, bankDistance));
  if (distance <= 0) {
    const half = side < 0 ? section.z - section.leftBankZ : section.rightBankZ - section.z;
    const u = Math.abs(offset) / half;
    return -0.95 * Math.pow(Math.max(0, 1 - u * u), 0.8);
  }
  const irregularity = noise(x * 0.085 + 21, z * 0.065 - 3);
  // Convex bends deposit wide, low point bars; concave bends expose a short cut-bank scarp.
  const bendInfluence = 1 - smooth(6, 15, distance);
  const bankHeight = 0.34 + (outerBend * 0.62 - innerBend * 0.18) * bendInfluence;
  const bank = bankHeight * (1 - Math.exp(-distance / (0.8 + innerBend * 3.4)));
  const terraceStart = 3.1 + innerBend * 4.6 + irregularity * 2.5;
  const lowerTerrace = (0.56 + outerBend * 0.23 * bendInfluence)
    * smooth(terraceStart, terraceStart + 1.4 + innerBend, distance);
  const upperStart = (side > 0 ? 17 : 12) + noise(x * 0.06, z * 0.07) * 5;
  const upperTerrace = 0.62 * smooth(upperStart, upperStart + 2.8, distance);
  const hills = smooth(side > 0 ? 17 : 11, side > 0 ? 47 : 33, distance)
    * (0.9 + (side > 0 ? 2.3 : 3.6) * noise(x * 0.035, z * 0.035));
  const erosion = (noise(x * 0.24, z * 0.21) - 0.5) * 0.45
    * smooth(1.2 + innerBend * 4, 5 + innerBend * 4, distance);
  const swale = -0.2 * smooth(0.58, 0.8, noise(x * 0.12 - 11, z * 0.075))
    * smooth(2.5, 5, distance);
  const scrollRidge = innerBend * 0.07 * Math.sin(distance * 3.2 + irregularity)
    * smooth(0.5, 1.7, distance) * (1 - smooth(4, 7, distance));
  return Math.max(0.012 * Math.min(distance, 1), bank + lowerTerrace + upperTerrace + hills + erosion + swale + scrollRidge);
}

// Dense shore/terrace sampling; coarse far-field columns. Each row has strictly
// increasing Z and a fixed X, so even the widest far-field strip cannot fold over.
const bankDistances = [0, 0.25, 0.55, 0.9, 1.3, 1.9, 2.6, 3.5, 4.6, 5.9, 7.4, 9.2, 11.4, ...Array.from({ length: 22 }, (_, i) => 13 + i * 1.5), ...Array.from({ length: 20 }, (_, i) => 48 + i * 3)];
const bedFractions = [-1, -0.7, -0.35, 0, 0.35, 0.7, 1];
const TERRAIN_COLS = bankDistances.length * 2 + bedFractions.length;
interface TerrainData { positions: Float32Array; indices: number[]; rows: number; cols: number; }
let defaultTerrain: TerrainData | undefined;

function makeTerrainData(size: number, segments: number): TerrainData {
  const cols = TERRAIN_COLS;
  const positions = new Float32Array((segments + 1) * cols * 3);
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const x = Math.fround((i / segments - 0.5) * size);
    const section = sampleRiverAtX(x);
    const left = section.leftBankZ - section.z, right = section.rightBankZ - section.z;
    const q = x / (size / 2);
    const outer = 144 * (0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - q * q)))
      + 3 * Math.sin(x * 0.061);
    const offsets = [left - outer, ...bankDistances.slice(1).reverse().map(d => left - d),
      ...bedFractions.map(u => u < 0 ? -u * left : u * right), ...bankDistances.slice(1).map(d => right + d), right + outer];
    for (let j = 0; j < cols; j++) {
      const z = Math.fround(section.z + offsets[j]);
      const index = (i * cols + j) * 3;
      const isShore = j === bankDistances.length || j === bankDistances.length + bedFractions.length - 1;
      positions[index] = x;
      positions[index + 1] = isShore ? 0 : terrainHeight(x, z, section);
      positions[index + 2] = z;
    }
    if (i < segments) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  return { positions, indices, rows: segments + 1, cols };
}
function terrainData(): TerrainData {
  return defaultTerrain ??= makeTerrainData(SCENE_CONFIG.terrainExtent, RIBBON_SEGMENTS);
}

/** Exact triangle interpolation of the default rendered terrain, used by anchors/cameras. */
export function sampleTerrainHeight(x: number, z: number): number {
  const { positions: p, rows, cols } = terrainData();
  const rowX = (row: number) => p[row * cols * 3];
  x = clamp(x, rowX(0), rowX(rows - 1));
  let low = 0, high = rows - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (rowX(mid) < x) low = mid; else high = mid;
  }
  const q = (x - rowX(low)) / (rowX(high) - rowX(low));
  const at = (row: number, col: number, axis: number) => p[(row * cols + col) * 3 + axis];
  const columnZ = (col: number) => mix(at(low, col, 2), at(high, col, 2), q);
  z = clamp(z, columnZ(0), columnZ(cols - 1));
  let left = 0, right = cols - 1;
  while (right - left > 1) {
    const mid = (left + right) >> 1;
    if (columnZ(mid) < z) left = mid; else right = mid;
  }
  const az = at(low, left, 2), bz = at(low, right, 2);
  const cz = at(high, left, 2), dz = at(high, right, 2);
  const ay = at(low, left, 1), by = at(low, right, 1);
  const cy = at(high, left, 1), dy = at(high, right, 1);
  if (z <= mix(bz, cz, q)) {
    const s = (z - mix(az, cz, q)) / (bz - az);
    return ay + q * (cy - ay) + s * (by - ay);
  }
  const s = (z - mix(bz, dz, q)) / (cz - dz);
  return by + q * (dy - by) + s * (cy - dy);
}

/** Slope is sin(inclination); bankDistance is positive on land and negative in water. */
export function sampleSurfaceContext(x: number, z: number) {
  const section = sampleRiverAtX(x);
  const dx = (sampleTerrainHeight(x + 0.25, z) - sampleTerrainHeight(x - 0.25, z)) / 0.5;
  const dz = (sampleTerrainHeight(x, z + 0.25) - sampleTerrainHeight(x, z - 0.25)) / 0.5;
  const gradient = Math.hypot(dx, dz);
  return { ...bankContext(x, z, section), height: sampleTerrainHeight(x, z),
    slope: gradient / Math.hypot(1, gradient) };
}

function finishGeometry(positions: number[] | Float32Array, indices: number[], uvs?: number[], colors?: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One continuous bed/shore/floodplain/hill mesh. Old halfWidth argument is retained for callers. */
export function buildValleyGeometry(size = SCENE_CONFIG.terrainExtent, segments = RIBBON_SEGMENTS, _halfWidth = 11): THREE.BufferGeometry {
  const data = size === SCENE_CONFIG.terrainExtent && segments === RIBBON_SEGMENTS
    ? terrainData() : makeTerrainData(size, segments);
  const geometry = finishGeometry(data.positions, data.indices);
  const normals = geometry.getAttribute('normal');
  const colors: number[] = [], surfaceWeights: number[] = [];
  const earth = new THREE.Color('#887a66'), dryGrass = new THREE.Color('#8c8a73');
  const meadow = new THREE.Color('#697f63'), wooded = new THREE.Color('#40594a');
  const rock = new THREE.Color('#93958b');
  const color = new THREE.Color();
  for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i], z = data.positions[i + 2];
    const s = sampleRiverAtX(x), surface = bankContext(x, z, s);
    const patch = noise(x * 0.105 + 8, z * 0.105);
    const broadPatch = valueNoise(x * 0.052 - 17, z * 0.059 + 3);
    const slope = Math.sqrt(Math.max(0, 1 - normals.getY(i / 3) ** 2));
    const dryGround = smooth(0.42, 0.76, broadPatch + (patch - 0.5) * 0.3);
    const meadowPatch = valueNoise(x * 0.026 + 12, z * 0.032 - 5);
    color.copy(meadow).lerp(wooded, surface.woodland * 0.79);
    color.lerp(dryGrass, smooth(0.36, 0.72, meadowPatch) * 0.54);
    color.lerp(earth, dryGround * 0.48);
    color.lerp(earth, smooth(0.17, 0.36, slope) * 0.45);
    color.lerp(rock, smooth(0.29, 0.55, slope) * 0.4);
    color.multiplyScalar(0.87 + patch * 0.24);
    colors.push(color.r, color.g, color.b);
    surfaceWeights.push(surface.bankDistance, surface.sand, surface.woodland);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('terrainSurface', new THREE.Float32BufferAttribute(surfaceWeights, 3));
  return geometry;
}

/** Default river uses the same X-rows/width calculation as terrain, including its hidden extension. */
export function buildWaterGeometry(curve: CatmullRomCurve3, width: number, segments = RIBBON_SEGMENTS, crossSegments = 6): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], flow: number[] = [];
  const cols = crossSegments + 1;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const x = Math.fround((u - 0.5) * SCENE_CONFIG.terrainExtent);
    const s = curve === RIVER_CURVE ? sampleRiverAtX(x) : undefined;
    const center = s ? new Vector3(s.x, 0, (s.leftBankZ + s.rightBankZ) / 2) : curve.getPointAt(u);
    const tangent = s ? undefined : curve.getTangentAt(u);
    const side = tangent ? new Vector3(-tangent.z, 0, tangent.x).normalize() : new Vector3(0, 0, 1);
    const half = s ? s.width * width / WATER_WIDTH / 2 : width / 2;
    for (let j = 0; j <= crossSegments; j++) {
      const v = j / crossSegments * 2 - 1;
      positions.push(center.x + side.x * v * half, SCENE_CONFIG.waterLevel, center.z + side.z * v * half);
      uvs.push(j / crossSegments, u * 60);

    }
    if (i < segments) for (let j = 0; j < crossSegments; j++) {
      const a = i * cols + j;
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  // The eroded/deposited channel is displaced from its source curve, so derive actual mesh flow.
  const centerAt = (row: number, axis: number) =>
    (positions[row * cols * 3 + axis] + positions[(row * cols + cols - 1) * 3 + axis]) / 2;
  for (let i = 0; i <= segments; i++) {
    const before = Math.max(0, i - 1), after = Math.min(segments, i + 1);
    const dx = centerAt(after, 0) - centerAt(before, 0), dz = centerAt(after, 2) - centerAt(before, 2);
    const length = Math.hypot(dx, dz);
    for (let j = 0; j < cols; j++) flow.push(dx / length, dz / length);
  }
  const geometry = finishGeometry(positions, indices, uvs);
  geometry.setAttribute('flowDirection', new THREE.Float32BufferAttribute(flow, 2));
  return geometry;
}

/** Legacy strip helper, with upward-facing triangle order. */
export function buildRibbonGeometry(curve: CatmullRomCurve3, width: number, y: number, segments = RIBBON_SEGMENTS): THREE.BufferGeometry {
  const geometry = buildWaterGeometry(curve, width, segments, 1);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, y);
  geometry.computeVertexNormals();
  return geometry;
}

/** Compatibility helper; the stage-one renderer uses only the unified valley mesh. */
export function buildBankGeometry(curve: CatmullRomCurve3, innerWidth: number, outerWidth: number, sideSign: 1 | -1,
  segments = RIBBON_SEGMENTS, crossSegments = 10, _seed = 1): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const cols = crossSegments + 1;
  const color = new THREE.Color('#92967b');
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const s = sampleRiverSection(t);
    const c = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    const normal = new Vector3(-tangent.z, 0, tangent.x).normalize();
    for (let j = 0; j <= crossSegments; j++) {
      const d = mix(innerWidth / 2, outerWidth / 2, j / crossSegments);
      const x = curve === RIVER_CURVE ? s.x : c.x + normal.x * d * sideSign;
      const z = curve === RIVER_CURVE ? s.z + d * sideSign : c.z + normal.z * d * sideSign;
      positions.push(x, curve === RIVER_CURVE ? terrainHeight(x, z, sampleRiverAtX(x)) : j / crossSegments * 0.6, z);
      colors.push(color.r, color.g, color.b);
    }
    if (i < segments) for (let j = 0; j < crossSegments; j++) {
      const a = i * cols + j;
      if (sideSign > 0) indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      else indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  return finishGeometry(positions, indices, undefined, colors);
}

export interface NodeAnchor {
  reachId: string;
  name: string;
  t: number;
  position: Vector3;
  bankSide?: 1 | -1;
}

export const NODE_ANCHORS: NodeAnchor[] = [
  { reachId: 'reach-a', name: '上游 A', t: 0.12, bankSide: -1 as const },
  { reachId: 'reach-b', name: '中游 B', t: 0.5, bankSide: 1 as const },
  { reachId: 'reach-c', name: '下游 C', t: 0.88, bankSide: -1 as const },
].map(anchor => {
  const s = sampleRiverSection(anchor.t);
  const shore = anchor.bankSide < 0 ? s.leftBankZ : s.rightBankZ;
  const z = shore + anchor.bankSide * 1.4 / s.tangentX;
  return { ...anchor, position: new Vector3(s.x, sampleTerrainHeight(s.x, z), z) };
});

export const OVERVIEW_CAMERA = {
  position: new Vector3(58, 29, 24),
  target: new Vector3(-8, 0.7, 0),
  fov: 46,
};

