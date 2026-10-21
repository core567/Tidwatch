// utils/auth.ts - JWT 登录态本地存储（不记录密码，不打印 token）

const TOKEN_KEY = 'tw_access_token';
const EXPIRES_KEY = 'tw_token_expires_at';
const USER_KEY = 'tw_user';

interface StoredSession {
  token: string;
  expiresAt: string;
  user: User;
}

export function saveSession(resp: LoginResponse): void {
  wx.setStorageSync(TOKEN_KEY, resp.accessToken);
  wx.setStorageSync(EXPIRES_KEY, resp.expiresAt);
  wx.setStorageSync(USER_KEY, resp.user);
}

export function getToken(): string | null {
  return wx.getStorageSync(TOKEN_KEY) || null;
}

export function getCurrentUser(): User | null {
  const u = wx.getStorageSync(USER_KEY);
  return (u as User) ?? null;
}

export function isLoggedIn(): boolean {
  const token = getToken();
  const expiresAt = wx.getStorageSync(EXPIRES_KEY) as string | undefined;
  if (!token) return false;
  // 提前 60s 视为过期，避免请求中途失效
  if (expiresAt && new Date(expiresAt).getTime() - 60_000 < Date.now()) {
    return false;
  }
  return true;
}

export function clearSession(): void {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(EXPIRES_KEY);
  wx.removeStorageSync(USER_KEY);
}

/** 统一登出：清登录态并跳转登录页（关闭所有页面栈） */
export function logout(): void {
  clearSession();
  wx.reLaunch({ url: '/pages/login/login' });
}

export function getStoredSession(): StoredSession | null {
  if (!isLoggedIn()) return null;
  return {
    token: getToken() as string,
    expiresAt: wx.getStorageSync(EXPIRES_KEY) as string,
    user: getCurrentUser() as User,
  };
}
