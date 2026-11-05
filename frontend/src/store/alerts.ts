import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveEvent } from '@/types/contract';
import {
  seenStateOf,
  type GlobalAlertItem,
  type SeenEventState,
} from '@/services/alertRules';

interface AlertStore {
  items: GlobalAlertItem[];
  activeBatch: GlobalAlertItem[];
  panelOpen: boolean;
  soundEnabled: boolean;
  seen: Record<string, SeenEventState>;
  pushBatch: (alerts: GlobalAlertItem[]) => void;
  seedSeen: (events: ActiveEvent[]) => void;
  updateSeen: (event: Pick<ActiveEvent, 'status' | 'priority' | 'version' | 'updatedAt' | 'eventId'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearHistory: () => void;
  dismissBatch: () => void;
  togglePanel: (open?: boolean) => void;
  toggleSound: () => void;
}

const MAX_HISTORY = 100;
const MAX_BATCH = 6;
const MAX_SEEN = 300;

function pruneSeen(seen: Record<string, SeenEventState>): Record<string, SeenEventState> {
  const entries = Object.entries(seen)
    .sort((a, b) => (b[1].updatedAt ?? '').localeCompare(a[1].updatedAt ?? ''))
    .slice(0, MAX_SEEN);
  return Object.fromEntries(entries);
}

export const useGlobalAlertStore = create<AlertStore>()(
  persist(
    (set) => ({
      items: [],
      activeBatch: [],
      panelOpen: false,
      soundEnabled: false,
      seen: {},
      pushBatch: (alerts) => set((state) => {
        if (alerts.length === 0) return state;
        const batch = [...state.activeBatch];
        for (const alert of alerts) {
          const index = batch.findIndex((item) => item.eventId === alert.eventId);
          if (index >= 0) batch[index] = alert;
          else batch.push(alert);
        }
        return {
          items: [...alerts, ...state.items].slice(0, MAX_HISTORY),
          activeBatch: batch.slice(-MAX_BATCH),
        };
      }),
      seedSeen: (events) => set((state) => {
        const seen = { ...state.seen };
        for (const event of events) {
          seen[event.eventId] = seenStateOf(event);
        }
        return { seen: pruneSeen(seen) };
      }),
      updateSeen: (event) => set((state) => ({
        seen: pruneSeen({ ...state.seen, [event.eventId]: seenStateOf(event) }),
      })),
      markRead: (id) => set((state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
        activeBatch: state.activeBatch.map((item) => (item.id === id ? { ...item, read: true } : item)),
      })),
      markAllRead: () => set((state) => ({
        items: state.items.map((item) => ({ ...item, read: true })),
        activeBatch: state.activeBatch.map((item) => ({ ...item, read: true })),
      })),
      clearHistory: () => set({ items: [], activeBatch: [] }),
      dismissBatch: () => set({ activeBatch: [] }),
      togglePanel: (open) => set((state) => ({ panelOpen: open ?? !state.panelOpen })),
      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
    }),
    {
      name: 'tidewatch-global-alerts',
      version: 1,
      partialize: (state) => ({
        items: state.items,
        seen: state.seen,
        soundEnabled: state.soundEnabled,
      }),
    },
  ),
);

export function useAlertUnreadCount(): number {
  return useGlobalAlertStore((state) => state.items.reduce(
    (count, item) => count + (item.read ? 0 : 1),
    0,
  ));
}
