/** Logical world units only. No DEM, survey coordinates or verified Han River data. */
export const SCENE_CONFIG = {
  mode: 'schematic' as const,
  label: '汉江示意河段',
  seed: 271026,
  waterLevel: 0,
  mainReachLength: 76,
  terrainExtent: 260,
  longitudinalSegments: 520,
  waterWidth: 4.6,
};

/** Future offline preprocessing output; conversion/validation belongs outside the renderer. */
export interface OfflineTerrainSource {
  mode: 'offline';
  provenance: {
    source: string;
    collectedAt: string;
    resolutionMeters: number;
    crs: string;
    localOrigin: [number, number, number];
    license: string;
  };
  centerline: ReadonlyArray<readonly [number, number, number]>;
  sampleHeight: (x: number, z: number) => number;
}
