// 集中式 API Client：所有页面只通过此处访问后端（GRP 7.4）。
import type {
  ApiErrorBody,
  EventAction,
  EventDetail,
  ActiveEvent,
  HealthResponse,
  LoginResponse,
  Observation,
  PageResult,
  Reach,
} from '@/types/contract';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const TOKEN_KEY = 'tw_access_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  status: number;

  constructor(body: ApiErrorBody, status: number) {
    super(body.message || '请求失败');
    this.name = 'ApiError';
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
  anonymous?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.anonymous ? null : getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiError(
      { code: 'NETWORK_ERROR', message: '无法连接后端服务，请确认 FastAPI 已启动' },
      0,
    );
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;

  if (res.status === 401) {
    clearToken();
  }
  const body: ApiErrorBody = data ?? {
    code: `HTTP_${res.status}`,
    message: `请求失败（${res.status}）`,
  };
  throw new ApiError(body, res.status);
}

export interface ObservationQuery {
  metric?: string;
  sourceType?: string;
  quality?: string;
  from?: string;
  to?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export const api = {
  health: () => request<HealthResponse>('/health', { anonymous: true }),
  me: () => request<LoginResponse['user']>('/auth/me'),
  login: (username: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      anonymous: true,
      body: { username, password },
    }),
  reaches: () => request<Reach[]>('/reaches'),
  reach: (reachId: string) => request<Reach>(`/reaches/${encodeURIComponent(reachId)}`),
  latest: (reachId: string) =>
    request<Observation[]>(`/reaches/${encodeURIComponent(reachId)}/latest`),
  observations: (reachId: string, query: ObservationQuery = {}) => {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<PageResult<Observation>>(
      `/reaches/${encodeURIComponent(reachId)}/observations${suffix}`,
    );
  },
  diagnostics: () => request<Diagnostics>('/admin/diagnostics'),
  ingestionErrors: (params: { reason?: string; page?: number; pageSize?: number } = {}) =>
    apiPage<IngestionErrorItem>('/admin/ingestion-errors', params),
  events: (params: { status?: string; reachId?: string; page?: number; pageSize?: number } = {}) =>
    apiPage<ActiveEvent>('/events', params),
  event: (eventId: string) => request<EventDetail>(`/events/${encodeURIComponent(eventId)}`),
  eventAction: (eventId: string, action: EventAction, reason?: string) =>
    request<ActiveEvent>(`/events/${encodeURIComponent(eventId)}/actions`, {
      method: 'POST',
      body: { action, reason: reason || null },
    }),

  // 通用分页查询占位，M1 起按领域补充
  page: <T>(path: string, query: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<PageResult<T>>(`${path}${suffix}`);
  },
};

function apiPage<T>(path: string, query: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<PageResult<T>>(`${path}${suffix}`);
}

export interface Diagnostics {
  appVersion: string;
  ruleVersion: string;
  ruleLabel: string | null;
  mqtt: {
    enabled: boolean;
    host: string;
    port: number;
    topicPrefix: string;
    staleSeconds: number;
  };
  counts: {
    reachesOnline: number;
    reachesStale: number;
    reachesOffline: number;
    observations: number;
    processedMessages: number;
    duplicateMessages: number;
    ingestionErrors: number;
  };
  latestErrors: IngestionErrorItem[];
}

export interface IngestionErrorItem {
  errorId: number;
  source: string;
  topic: string | null;
  reason: string;
  detail: string | null;
  rawPayload?: string;
  receivedAt: string | null;
}
