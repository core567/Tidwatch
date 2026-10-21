import { create } from 'zustand';
import { api, clearToken, setToken } from '@/services/apiClient';
import type { User } from '@/types/contract';

interface AuthState {
  user: User | null;
  authenticated: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authenticated: false,
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
