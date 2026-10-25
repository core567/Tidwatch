import { create } from 'zustand';
import type { ConnectionState } from '@/services/sse';

interface StreamState {
  state: ConnectionState;
  setState: (state: ConnectionState) => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  state: 'disconnected',
  setState: (state) => set({ state }),
}));

export function useStreamState(): ConnectionState {
  return useStreamStore((s) => s.state);
}
