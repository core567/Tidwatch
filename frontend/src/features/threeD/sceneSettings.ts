import { create } from 'zustand';
export type SceneQuality = 'low' | 'medium' | 'high';
export const QUALITY_SETTINGS = {
  low: { dpr: 1, shadowSize: 0 },
  medium: { dpr: 1.5, shadowSize: 2048 },
  high: { dpr: 1.8, shadowSize: 4096 },
} as const;
interface Settings {
  quality: SceneQuality;
  motion: boolean;
  shadows: boolean;
  directions: boolean;
  setQuality: (quality: SceneQuality) => void;
  setMotion: (motion: boolean) => void;
  setShadows: (shadows: boolean) => void;
  setDirections: (directions: boolean) => void;
}
export const useSceneSettings = create<Settings>(set => ({
  quality: 'medium',
  motion: typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  shadows: true,
  directions: false,
  setQuality: quality => { if (Object.prototype.hasOwnProperty.call(QUALITY_SETTINGS, quality)) set({ quality }); },
  setMotion: motion => set({ motion }),
  setShadows: shadows => set({ shadows }),
  setDirections: directions => set({ directions }),
}));
