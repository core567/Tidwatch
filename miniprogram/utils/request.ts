// utils/request.ts - wx.request 统一封装
// - baseURL 集中在 config/env
// - 自动附带 JWT
// - 统一解析 GRP 错误结构 { code, message, details, requestId }
// - 401 清理登录态并跳登录页
// - GET 幂等请求支持一次自动重试（网络抖动）

import { ENV } from '../config/env';
import { getToken, clearSession } from './auth';
import { logger } from './logger';

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
  const token = options.anonymous ? null : getToken();
  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${ENV.API_BASE_URL}${path}`,
      method: options.method ?? 'GET',
      data: options.data as never,
      timeout: ENV.REQUEST_TIMEOUT_MS,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
        const status = res.statusCode;
        const body = res.data as Partial<ApiErrorBody> & Record<string, unknown>;
        if (status >= 200 && status < 300) {
          resolve(body as unknown as T);
          return;
        }
        if (status === 401) {
          // 登录失效：清状态并跳登录，避免静默继续
          logger.warn('request', `401 for ${path}, redirect to login`);
          clearSession();
          wx.reLaunch({ url: '/pages/login/login' });
        }
        const errBody: ApiErrorBody = {
          code: (body.code as string) || `HTTP_${status}`,
          message: (body.message as string) || `请求失败（${status}）`,
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
