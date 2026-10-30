import { create } from 'zustand';

export type View3d = 'overview' | 'reach-a' | 'reach-b' | 'reach-c';

interface CameraState {
  view: View3d;
  flying: boolean;
  requestId: number;
  flyTo: (view: View3d) => void;
  setFlying: (flying: boolean) => void;
}

/** 每次请求都有独立编号，同一站点也可以重新取景。 */
export const useCameraStore = create<CameraState>((set) => ({
  view: 'overview',
  flying: false,
  requestId: 0,
  flyTo: (view) => {
    if (!['overview', 'reach-a', 'reach-b', 'reach-c'].includes(view)) return;
    set((state) => ({ view, flying: true, requestId: state.requestId + 1 }));
  },
  setFlying: (flying) => set({ flying }),
}));
