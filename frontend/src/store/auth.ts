import { create } from 'zustand';
import { api, clearToken, getToken, setToken } from '@/services/apiClient';
import type { User } from '@/types/contract';

interface AuthState {
  user: User | null;
  authenticated: boolean;
  /** 刷新页面后用 token 调 /auth/me 恢复登录态；失败则清除。 */
  restore: () => Promise<void>;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // localStorage 有 token 时先认为已登录（避免页面闪烁），再由 restore 校验
  authenticated: !!getToken(),

  async restore() {
    if (!getToken()) {
      set({ user: null, authenticated: false });
      return;
    }
    try {
      const user = await api.me();
      set({ user, authenticated: true });
    } catch {
      clearToken();
      set({ user: null, authenticated: false });
    }
  },

  async login(username, password) {
    const resp = await api.login(username, password);
    setToken(resp.accessToken);
    set({ user: resp.user, authenticated: true });
    return resp.user;
  },

  logout() {
    clearToken();
    set({ user: null, authenticated: false });
  },
}));
