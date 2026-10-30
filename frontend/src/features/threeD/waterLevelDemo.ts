import { create } from 'zustand';
import { clampDemoWaterLevel } from './waterLevelConfig';
interface WaterLevelDemo {
  level: number;
  setLevel: (logicalOffset: number) => void;
}
/** Deliberately separate from observations and the RiverScene business contract. */
export const useWaterLevelDemo = create<WaterLevelDemo>(set => ({
  level: 0,
  setLevel: value => set({ level: clampDemoWaterLevel(value) }),
}));
