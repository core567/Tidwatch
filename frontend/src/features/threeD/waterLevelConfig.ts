/** Relative scene offsets, intentionally unrelated to observed metres. */
export const WATER_DEMO_RANGE = { min: -0.12, max: 0.12 } as const;
export function clampDemoWaterLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(WATER_DEMO_RANGE.min, Math.min(WATER_DEMO_RANGE.max, value)) : 0;
}
