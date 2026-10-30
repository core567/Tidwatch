import { sampleRiverSection, sampleTerrainHeight, NODE_ANCHORS } from './riverGeometry.ts';

const crossing = sampleRiverSection(0.66);
export const BRIDGE = {
  x: crossing.x, z: (crossing.leftBankZ + crossing.rightBankZ) / 2,
  halfSpan: crossing.width / 2 + 2.4, width: 1.8,
  deckY: Math.max(1.95, sampleTerrainHeight(crossing.x, crossing.leftBankZ - 2.4) + 0.9,
    sampleTerrainHeight(crossing.x, crossing.rightBankZ + 2.4) + 0.9),
};
export const ROAD_HALF_WIDTH = 0.9;
export const ROAD_EXTENT = 86;
export const ROAD_SHOULDER_WIDTH = 1.4;
const MAX_ROAD_GRADE = 0.15;

function roadPlan(offset: number) {
  const outside = Math.max(0, Math.abs(offset) - BRIDGE.halfSpan);
  return { x: BRIDGE.x + Math.sign(offset) * (Math.sin(outside / 18) * 6.5 + outside * 0.10),
    z: BRIDGE.z + offset };
}

// A fill-only upper envelope avoids reproducing each terrain scarp in the road.
export const ROAD_PROFILE_OFFSETS = [...Array.from({ length: ROAD_EXTENT * 8 + 1 }, (_, i) => i / 4 - ROAD_EXTENT),
  -BRIDGE.halfSpan, BRIDGE.halfSpan].sort((a, b) => a - b);
const roadProfile = ROAD_PROFILE_OFFSETS.map(offset => {
  const p = roadPlan(offset);
  const base = Math.max(...[-.9, -.45, 0, .45, .9].map(dx => sampleTerrainHeight(p.x + dx, p.z))) + .07;
  return { offset, y: base };
});
for (const p of roadProfile)
  BRIDGE.deckY = Math.max(BRIDGE.deckY, p.y - MAX_ROAD_GRADE * Math.max(0, Math.abs(p.offset) - BRIDGE.halfSpan));
for (const p of roadProfile) if (Math.abs(p.offset) <= BRIDGE.halfSpan) p.y = BRIDGE.deckY;
for (let i = 1; i < roadProfile.length; i++) {
  const a = roadProfile[i - 1], b = roadProfile[i];
  b.y = Math.max(b.y, a.y - MAX_ROAD_GRADE * (b.offset - a.offset));
}
for (let i = roadProfile.length - 2; i >= 0; i--) {
  const a = roadProfile[i], b = roadProfile[i + 1];
  a.y = Math.max(a.y, b.y - MAX_ROAD_GRADE * (b.offset - a.offset));
}

/** Logical illustrative grades, with exact bridge joins; not a surveyed road design. */
export function roadPoint(offset: number) {
  offset = Math.max(-ROAD_EXTENT, Math.min(ROAD_EXTENT, offset));
  const p = roadPlan(offset);
  let low = 0, high = roadProfile.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (roadProfile[middle].offset < offset) low = middle; else high = middle;
  }
  const a = roadProfile[low], b = roadProfile[high], t = (offset - a.offset) / (b.offset - a.offset);
  return { ...p, y: a.y + (b.y - a.y) * t };
}

/** Subdivided earthwork stays above the terrain rather than crossing it at the toe. */
export function roadShoulderPoint(offset: number, side: number, fraction: number) {
  const p = roadPoint(offset);
  const x = p.x + side * (ROAD_HALF_WIDTH + ROAD_SHOULDER_WIDTH * fraction);
  const toeX = p.x + side * (ROAD_HALF_WIDTH + ROAD_SHOULDER_WIDTH);
  const toeY = sampleTerrainHeight(toeX, p.z) + .025;
  const y = Math.max((p.y + .018) * (1 - fraction) + toeY * fraction, sampleTerrainHeight(x, p.z) + .025);
  return { x, y, z: p.z };
}
const buildingSection = sampleRiverSection(0.74);
export const BUILDING = { x: buildingSection.x + 2.2, z: buildingSection.rightBankZ + 10, width: 2.8, depth: 2.1 };
export const BUILDING_BASE = Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b =>
  sampleTerrainHeight(BUILDING.x + a * BUILDING.width / 2, BUILDING.z + b * BUILDING.depth / 2)))) + 0.03;

export function infrastructureExcluded(x: number, z: number, radius = 0) {
  if (NODE_ANCHORS.some(a => Math.hypot(a.position.x - x, a.position.z - z) < 3.2 + radius)) return true;
  if (Math.abs(x - BUILDING.x) < BUILDING.width / 2 + 0.8 + radius &&
      Math.abs(z - BUILDING.z) < BUILDING.depth / 2 + 0.8 + radius) return true;
  const offset = z - BRIDGE.z;
  if (Math.abs(offset) > ROAD_EXTENT + radius) return false;
  const point = roadPoint(Math.max(-ROAD_EXTENT, Math.min(ROAD_EXTENT, offset)));
  return Math.abs(x - point.x) < ROAD_HALF_WIDTH + ROAD_SHOULDER_WIDTH + 0.2 + radius;
}

/** Conservative upper envelope of fixed facilities for flight planning. */
export function sceneObstacleHeight(x: number, z: number) {
  let height = sampleTerrainHeight(x, z);
  const offset = z - BRIDGE.z;
  if (Math.abs(offset) <= ROAD_EXTENT) {
    const road = roadPoint(offset);
    if (Math.abs(x - road.x) < ROAD_HALF_WIDTH + ROAD_SHOULDER_WIDTH)
      height = Math.max(height, road.y + .04);
  }
  if (Math.abs(x - BRIDGE.x) < BRIDGE.width / 2 + 0.7 && Math.abs(z - BRIDGE.z) < BRIDGE.halfSpan + 0.6)
    height = Math.max(height, BRIDGE.deckY + 0.65);
  if (Math.abs(x - BUILDING.x) < BUILDING.width / 2 + 0.5 && Math.abs(z - BUILDING.z) < BUILDING.depth / 2 + 0.5)
    height = Math.max(height, BUILDING_BASE + 1.9);
  for (const a of NODE_ANCHORS) if (Math.hypot(x - a.position.x, z - a.position.z) < 1.75)
    height = Math.max(height, a.position.y + 2.7);
  return height;
}

