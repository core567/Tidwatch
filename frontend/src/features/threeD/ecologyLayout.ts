import { sampleSurfaceContext, sampleRiverAtX } from './riverGeometry.ts';
import { infrastructureExcluded } from './landscapeLayout.ts';
import { STATION_VIEWS } from './stationViews.ts';
import { SCENE_CONFIG } from './sceneConfig.ts';

export type EcologyQuality = 'low' | 'medium' | 'high';
export type TreeSpecies = 'deciduous' | 'poplar' | 'willow';
export interface EcologyInstance {
  x: number; y: number; z: number;
  height: number; width: number; rotation: number; tint: number;
  variant: number;
}
export interface TreeInstance extends EcologyInstance { species: TreeSpecies; }
export interface EcologyLayout {
  trees: TreeInstance[];
  shrubs: EcologyInstance[];
  grass: EcologyInstance[];
  pebbles: EcologyInstance[];
  reeds: EcologyInstance[];
}
const budgets = {
  low: { trees: 210, shrubs: 180, grass: 300, pebbles: 90, reeds: 65 },
  medium: { trees: 440, shrubs: 420, grass: 680, pebbles: 220, reeds: 140 },
  high: { trees: 760, shrubs: 700, grass: 1100, pebbles: 380, reeds: 230 },
};

function randomGenerator(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Authored grove envelopes are schematic composition, not surveyed land-cover data.
// Unequal elliptical groups leave meadow openings; the ground cover still modulates the density.
const groves = [
  [-34, -13, 21, 9], [-7, -15, 22, 10], [30, -14, 21, 10],
  [-34, 17, 20, 11], [-9, 24, 22, 12], [35, 23, 23, 12],
  [-73, -35, 20, 15], [68, 42, 20, 16], [4, -55, 28, 12],
];
function groveDensity(x: number, z: number) {
  const warpX = x + Math.sin(z * .19) * 2.3, warpZ = z + Math.sin(x * .13 + 1.2) * 2;
  let density = 0;
  for (const [gx, gz, rx, rz] of groves) {
    const distance = ((warpX - gx) / rx) ** 2 + ((warpZ - gz) / rz) ** 2;
    density = Math.max(density, Math.exp(-distance * 1.6));
  }
  return density;
}
function blocksStationView(x: number, z: number, radius: number) {
  return Object.values(STATION_VIEWS).some(({ position, target }) => {
    const dx = position.x - target.x, dz = position.z - target.z;
    const t = Math.max(0, Math.min(1, ((x - target.x) * dx + (z - target.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - target.x - t * dx, z - target.z - t * dz) < 1.15 + radius;
  });
}

function buildLayout(): EcologyLayout {
  const random = randomGenerator(SCENE_CONFIG.seed + 3187);
  const layout: EcologyLayout = { trees: [], shrubs: [], grass: [], pebbles: [], reeds: [] };
  const occupied = new Map<string, TreeInstance[]>();
  for (const kind of ['trees', 'shrubs', 'grass', 'pebbles', 'reeds'] as const) {
    for (let attempt = 0; layout[kind].length < budgets.high[kind] && attempt < 180000; attempt++) {
      const distant = kind === 'trees' ? layout.trees.length % 8 === 0 : random() < .19, isReed = kind === 'reeds';
      const x = (random() * 2 - 1) * (isReed ? 65 : distant ? 90 : 65);
      let z = (random() * 2 - 1) * (distant ? 65 : 40);
      if (isReed) {
        const section = sampleRiverAtX(x), side = random() < .5 ? -1 : 1;
        const shore = side < 0 ? section.leftBankZ : section.rightBankZ;
        z = shore + side * (.08 + random() ** 2 * 1.7) / section.tangentX;
        const patch = Math.sin(x * .23 + side * 2.7) * .55 + Math.sin(x * .61 - side) * .25;
        if (patch < .18) continue;
      } else if (distant && Math.abs(x) < 65 && Math.abs(z) < 40) continue;
      if(kind==='trees' && !distant && random()<.72){
        const section=sampleRiverAtX(x),side=random()<.5?-1:1;
        z=(side<0?section.leftBankZ:section.rightBankZ)+side*(3.8+random()**.7*12);
      }
      const surface = sampleSurfaceContext(x, z);
      const isTree = kind === 'trees', isRock = kind === 'pebbles';
      if (surface.bankDistance <= (isTree ? 1.5 : isReed ? .05 : .15)
        || surface.slope >= (isRock ? .7 : .42)) continue;
      if ((isTree || kind === 'shrubs') && surface.height <= .16) continue;
      if (isReed && (surface.bankDistance >= 2.2 || surface.height > .36)) continue;
      const riparian = surface.bankDistance < 10 && surface.sand < .6;
      const grove = groveDensity(x, z);
      const density = isTree ? (.008 + grove ** 1.2 * 1.75 + (riparian?.28:0)) * (.12 + surface.woodland * 1.3)
        : kind === 'shrubs' ? .025 + grove * .58 + (riparian ? .1 : 0)
        : kind === 'grass' ? (1 - surface.sand) * (.13 + .7 * (1 - grove))
        : isReed ? 1 : (.008 + surface.sand * .65) * (.25 + .75 * Math.max(0, Math.sin(x * .39 + z * .7)));
      if (random() > density) continue;
      const speciesRoll = random();
      const species: TreeSpecies = riparian && speciesRoll < .72 ? 'willow' : speciesRoll < .27 ? 'poplar' : 'deciduous';
      const maturity = random();
      const height = isTree ? 2.05 + maturity * 2.45 : kind === 'shrubs' ? .25 + random() * .42
        : kind === 'grass' ? .13 + random() * .19 : isReed ? .42 + random() * .43 : .035 + random() ** 2.2 * .17;
      const width = isTree ? species === 'poplar' ? .95 + maturity * .95 + random() * .25 : 1.9 + maturity * 2.0 + random() * .8
        : kind === 'shrubs' ? .48 + random() * .7 : kind === 'grass' ? .42 + random() * .65
        : isReed ? .34 + random() * .47 : height * (1.5 + random() * 1.2);
      if (infrastructureExcluded(x, z, width / 2)) continue;
      if (isTree && (blocksStationView(x, z, width / 2) || surface.bankDistance < width / 2 + .65)) continue;
      const gx = Math.floor(x), gz = Math.floor(z);
      if (isTree) {
        let tooClose = false;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          for (const other of occupied.get(`${gx + dx},${gz + dz}`) ?? []) {
            if (Math.hypot(x - other.x, z - other.z) < .96) tooClose = true;
          }
        }
        if (tooClose) continue;
      }
      const item = { x, y: surface.height, z, height, width,
        rotation: random() * Math.PI * 2, tint: .2 + random() * .65, variant: random() < .5 ? 0 : 1 };
      if (isTree) {
        const tree = { ...item, species };
        layout.trees.push(tree);
        const key = `${gx},${gz}`;
        if (!occupied.has(key)) occupied.set(key, []);
        occupied.get(key)!.push(tree);
      } else layout[kind].push(item);
    }
  }
  return layout;
}

let master: EcologyLayout | undefined;
/** Nested prefixes keep all existing roots in place when quality changes. */
export function createEcologyLayout(quality: EcologyQuality = 'medium'): EcologyLayout {
  const source = master ??= buildLayout(), budget = budgets[quality];
  return { trees: source.trees.slice(0, budget.trees), shrubs: source.shrubs.slice(0, budget.shrubs),
    grass: source.grass.slice(0, budget.grass), pebbles: source.pebbles.slice(0, budget.pebbles),
    reeds: source.reeds.slice(0, budget.reeds) };
}
