import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number; // 本地时间戳
  mode?: 'rule' | 'llm';
  tools?: string[];
  warnings?: string[];
  model?: string | null;
  sources?: { label: string; at?: string }[];
  feedback?: 'up' | 'down' | null;
  pending?: boolean; // 正在生成
  startedAt?: number; // 请求开始（真实计时）
  elapsedMs?: number; // 请求耗时
  error?: boolean;
}

export interface AiConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiMessage[];
}

const STORAGE_KEY = 'tidewatch-ai-conversations';
const MAX_CONVERSATIONS = 20;
const VERSION = 1;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function now(): number {
  return Date.now();
}

function makeConversation(): AiConversation {
  const t = now();
  return { id: uid(), title: '新会话', createdAt: t, updatedAt: t, messages: [] };
}

interface AiState {
  version: number;
  conversations: AiConversation[];
  activeId: string;
  activeConversation: () => AiConversation;
  newConversation: () => string;
  select: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  append: (msg: Omit<AiMessage, 'id' | 'at'> & { at?: number }) => void;
  updateMessage: (id: string, patch: Partial<AiMessage>) => void;
}

/** 容量裁剪：只保留最近 MAX_CONVERSATIONS 个会话。 */
function cap(list: AiConversation[]): AiConversation[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
}

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      version: VERSION,
      conversations: [],
      activeId: '',

      activeConversation: () => {
        const { conversations, activeId } = get();
        let c = conversations.find((x) => x.id === activeId);
        if (!c) {
          // 懒初始化首个会话
          c = makeConversation();
          set((s) => ({ conversations: [c!, ...s.conversations], activeId: c!.id }));
        }
        return c;
      },

      newConversation: () => {
        const c = makeConversation();
        set((s) => ({ conversations: [c, ...s.conversations], activeId: c.id }));
        return c.id;
      },

      select: (id) => set({ activeId: id }),

      remove: (id) =>
        set((s) => {
          const remaining = s.conversations.filter((x) => x.id !== id);
          let activeId = s.activeId;
          if (id === activeId) activeId = remaining[0]?.id ?? '';
          return { conversations: remaining, activeId };
        }),

      clearAll: () => set({ conversations: [], activeId: '' }),

      append: (msg) =>
        set((s) => {
          let list = s.conversations;
          let activeId = s.activeId;
          let target = list.find((x) => x.id === activeId);
          if (!target) {
            target = makeConversation();
            list = [target, ...list];
            activeId = target.id;
          }
          const full: AiMessage = { id: uid(), at: msg.at ?? now(), ...msg };
          const title =
            target.messages.length === 0 && msg.role === 'user'
              ? msg.text.slice(0, 18)
              : target.title;
          const updated: AiConversation = {
            ...target,
            title,
            updatedAt: now(),
            messages: [...target.messages, full],
          };
          const conversations = cap(list.map((x) => (x.id === updated.id ? updated : x)));
          return { conversations, activeId };
        }),

      updateMessage: (id, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.messages.some((m) => m.id === id)
              ? { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }
              : c,
          ),
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // 不持久化函数（activeConversation 是方法）
      partialize: (s) => ({
        version: s.version,
        conversations: s.conversations,
        activeId: s.activeId,
      }),
      // 数据损坏/版本不兼容时回退为空，不影响应用
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          // localStorage 解析失败：清空到安全状态
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* ignore */
          }
          if (state) {
            state.conversations = [];
            state.activeId = '';
          }
        }
      },
    },
  ),
);

export function formatMsgTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
