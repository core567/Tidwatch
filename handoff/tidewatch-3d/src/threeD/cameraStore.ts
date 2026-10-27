import { create } from 'zustand';

export type View3d = 'overview' | 'reach-a' | 'reach-b' | 'reach-c';

interface CameraState {
  view: View3d;
  flying: boolean;
  flyTo: (view: View3d) => void;
  setFlying: (flying: boolean) => void;
}

/** 3D 相机目标视图；场景常驻，只切换相机位姿，不重建场景。 */
export const useCameraStore = create<CameraState>((set) => ({
  view: 'overview',
  flying: false,
  flyTo: (view) => set({ view, flying: true }),
  setFlying: (flying) => set({ flying }),
}));
