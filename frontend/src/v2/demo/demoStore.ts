import { create } from 'zustand';
import { DEMO_TICK_COUNT, phaseOf, type DemoPhase } from './demoScenario';

export type DemoPlayback = 'idle' | 'playing' | 'paused';

interface DemoState {
  /** 演示模式是否开启（内存态，不持久化；刷新/重载即回到真实模式） */
  enabled: boolean;
  playback: DemoPlayback;
  /** 演示时间轴游标（0..DEMO_TICK_COUNT-1），与真实系统时钟无关 */
  clock: number;
  /** 播放倍速：1× 或 4×（每秒推进 1 或 4 个演示步） */
  speed: 1 | 4;
  phase: DemoPhase;
  enable: () => void;
  disable: () => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  advance: () => void;
  setSpeed: (speed: 1 | 4) => void;
}

/**
 * 演示模式全局状态。设计为模块级 store 以便 F3 数字孪生复用同一数据源；
 * 不写入任何持久化存储：刷新页面后自动回到真实监测模式。
 */
export const useDemoStore = create<DemoState>((set, get) => ({
  enabled: false,
  playback: 'idle',
  clock: 0,
  speed: 1,
  phase: phaseOf(0),
  enable: () => set({ enabled: true, playback: 'playing', clock: 0, phase: phaseOf(0) }),
  disable: () => set({ enabled: false, playback: 'idle', clock: 0, phase: phaseOf(0) }),
  pause: () => set({ playback: 'paused' }),
  resume: () => set({ playback: 'playing' }),
  replay: () => set({ playback: 'playing', clock: 0, phase: phaseOf(0) }),
  advance: () => {
    const { clock } = get();
    if (clock >= DEMO_TICK_COUNT - 1) return; // 播放到末尾保持最后一帧，重新播放需 replay()
    const next = clock + 1;
    set({ clock: next, phase: phaseOf(next) });
  },
  setSpeed: (speed) => set({ speed }),
}));
