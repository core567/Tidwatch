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

/**
 * 退出到演示模式：仅清除本地 JWT，不跳页（由调用方刷新数据）。
 * 当前后端为本地演示模式（未登录请求返回演示用户），清除后请求落入
 * demo fallback，前端据此显示「演示模式」；不删除任何业务数据。
 */
export function logoutToDemo(): void {
  clearSession();
}

export function getStoredSession(): StoredSession | null {
  if (!isLoggedIn()) return null;
  return {
    token: getToken() as string,
    expiresAt: wx.getStorageSync(EXPIRES_KEY) as string,
    user: getCurrentUser() as User,
  };
}

/**
 * 会话模式：
 * - 'jwt'：通过 /auth/login 真实校验账号密码、本地有未过期 token
 * - 'demo'：无有效登录态，依赖后端 demo 兜底；页面必须显式标注“演示模式”，
 *   不得把兜底身份 u-admin 当作已登录用户展示
 */
export function getSessionMode(): 'jwt' | 'demo' {
  return isLoggedIn() ? 'jwt' : 'demo';
}
