// utils/request.ts - wx.request 统一封装
// 鉴权双模式：
// - 正式模式：本地有真实登录 token 时附带 Bearer；401 清除过期会话并抛出，由调用方决定跳登录。
// - 本地演示模式：无 token 也允许请求，后端 demo 兜底返回演示用户；页面必须显式展示“演示模式”，
//   不得把 demo 兜底误当作用户已登录（见 utils/auth.ts / profile 页）。
import { ENV } from '../config/env';
import { logger } from './logger';
import { getToken, clearSession } from './auth';

export class RequestError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  statusCode?: number;

  constructor(body: ApiErrorBody, statusCode?: number) {
    super(body.message || '请求失败');
    this.name = 'RequestError';
    this.code = body.code || 'UNKNOWN';
    this.details = body.details;
    this.requestId = body.requestId;
    this.statusCode = statusCode;
  }
}

interface RequestOptions {
  // wx.request 不支持 PATCH；后端补丁接口统一用 POST 子资源表达
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown> | string;
  /** 不带 Authorization（如登录接口） */
  anonymous?: boolean;
  /** GET 失败时自动重试一次 */
  retry?: boolean;
}

function doRequest<T>(path: string, options: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    // 有真实登录态才带 token；匿名请求（登录接口/健康检查）不带
    if (!options.anonymous) {
      const token = getToken();
      if (token) header.Authorization = `Bearer ${token}`;
    }
    wx.request({
      url: `${ENV.API_BASE_URL}${path}`,
      method: options.method ?? 'GET',
      data: options.data as never,
      timeout: ENV.REQUEST_TIMEOUT_MS,
      header,
      success: (res) => {
        const status = res.statusCode;
        const body = res.data as Partial<ApiErrorBody> & Record<string, unknown>;
        if (status >= 200 && status < 300) {
          resolve(body as unknown as T);
          return;
        }
        // 401：token 失效/伪造，清除本地会话，避免“看起来已登录”
        if (status === 401 && !options.anonymous) {
          clearSession();
        }
        const errBody: ApiErrorBody = {
          code: (body.code as string) || (status === 401 ? 'UNAUTHORIZED' : `HTTP_${status}`),
          message:
            (body.message as string) ||
            (status === 401 ? '登录已失效，请重新登录' : `请求失败（${status}）`),
          details: body.details,
          requestId: body.requestId as string | undefined,
        };
        reject(new RequestError(errBody, status));
      },
      fail: (err) => {
        reject(
          new RequestError(
            {
              code: 'NETWORK_ERROR',
              message: `网络不可达：${err.errMsg}（检查后端是否启动 / 真机是否使用局域网 IP）`,
            },
            0,
          ),
        );
      },
    });
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await doRequest<T>(path, options);
  } catch (e) {
    const retryable =
      options.retry !== false &&
      (options.method ?? 'GET') === 'GET' &&
      e instanceof RequestError &&
      (e.code === 'NETWORK_ERROR' || e.statusCode === 0);
    if (retryable) {
      logger.warn('request', `retry once: ${path}`);
      return doRequest<T>(path, { ...options, retry: false });
    }
    throw e;
  }
}
