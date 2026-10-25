import { create } from 'zustand';

export type NotificationTone = 'info' | 'ok' | 'watch' | 'danger';

export interface AppNotification {
  id: string;
  title: string;
  description?: string;
  tone: NotificationTone;
  at: string;
  to?: string;
  read: boolean;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: NotificationTone;
}

export interface PushNotificationInput {
  title: string;
  description?: string;
  tone?: NotificationTone;
  to?: string;
  toast?: boolean;
}

interface NotificationState {
  items: AppNotification[];
  toasts: ToastItem[];
  push: (input: PushNotificationInput) => string;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clear: () => void;
  dismissToast: (id: string) => void;
}

const MAX_ITEMS = 50;
const MAX_TOASTS = 3;
const TOAST_MS = 4500;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `n-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  toasts: [],
  push: (input) => {
    const id = newId();
    const now = new Date().toISOString();
    const tone = input.tone ?? 'info';
    set((state) => ({
      items: [
        { id, title: input.title, description: input.description, tone, at: now, to: input.to, read: false },
        ...state.items,
      ].slice(0, MAX_ITEMS),
      toasts: input.toast === false
        ? state.toasts
        : [...state.toasts, { id, title: input.title, description: input.description, tone }].slice(-MAX_TOASTS),
    }));
    if (input.toast !== false) {
      setTimeout(() => get().dismissToast(id), TOAST_MS);
    }
    return id;
  },
  markRead: (id) =>
    set((state) => ({ items: state.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  markAllRead: () => set((state) => ({ items: state.items.map((n) => ({ ...n, read: true })) })),
  clear: () => set({ items: [], toasts: [] }),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function useUnreadCount(): number {
  return useNotificationStore((s) => s.items.filter((n) => !n.read).length);
}
