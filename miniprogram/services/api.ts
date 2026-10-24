// services/api.ts - 小程序业务接口（与 PC Web 共用同一后端契约）
// M0 为骨架；M3 后端接口就绪后对接，路径以 GRP V2.1 第 8 章契约为准。

import { request } from '../utils/request';
import { saveSession, getToken } from '../utils/auth';
import { wsClient } from '../utils/ws';
import { ENV } from '../config/env';
import { logger } from '../utils/logger';

/** 拼 query string（小程序基础库不保证 URLSearchParams 可用） */
function toQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface InspectionTask {
  taskId: string;
  eventId: string | null;
  focusId: string | null;
  reachId: string;
  actionType: TaskActionType;
  title: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  status: TaskStatus;
  assignee: string | null;
  dueAt: string | null;
  reason: string;
  resultNote: string | null;
  resultConclusion: 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN' | null;
  attachmentIds: string[];
  completedAt: string | null;
  createdAt: string;
}

// ---------- 鉴权 ----------

export async function login(username: string, password: string): Promise<LoginResponse> {
  const resp = await request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    anonymous: true,
    data: { username, password },
  });
  saveSession(resp);
  return resp;
}

// ---------- 巡检任务 ----------

export interface TaskListQuery {
  status?: TaskStatus;
  assignee?: string;
  page?: number;
  pageSize?: number;
}

export function listTasks(query: TaskListQuery = {}): Promise<PageResult<InspectionTask>> {
  return request<PageResult<InspectionTask>>(
    `/api/inspection-tasks${toQuery(query as Record<string, string | number | undefined>)}`,
  );
}

export function getTask(taskId: string): Promise<InspectionTask> {
  return request<InspectionTask>(`/api/inspection-tasks/${encodeURIComponent(taskId)}`);
}

/** 任务流转：ACCEPT / START / CANCEL，由后端校验状态并写 Run Trace */
export function actTask(
  taskId: string,
  action: 'ACCEPT' | 'START' | 'CANCEL',
  reason?: string,
): Promise<InspectionTask> {
  return request<InspectionTask>(`/api/inspection-tasks/${encodeURIComponent(taskId)}/actions`, {
    method: 'POST',
    data: { action, reason },
  });
}

export interface TaskResultPayload {
  observationNote: string;
  observedAt: string; // ISO 8601，现场观测时间
  attachmentIds?: string[];
  /** 现场结论（人工确认，不伪装为模型输出） */
  conclusion?: string;
  /** 若现场认为应触发再评估，由后端决定是否执行 */
  requestReevaluate?: boolean;
}

export function submitTaskResult(taskId: string, payload: TaskResultPayload): Promise<InspectionTask> {
  return request<InspectionTask>(
    `/api/inspection-tasks/${encodeURIComponent(taskId)}/results`,
    { method: 'POST', data: payload as unknown as Record<string, unknown> },
  );
}

// ---------- 图片上传（multipart，独立于 request JSON 封装） ----------

export function uploadPhoto(filePath: string): Promise<AttachmentMeta> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    wx.uploadFile({
      url: `${ENV.API_BASE_URL}/api/inspection-tasks/uploads`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data) as AttachmentMeta);
          } catch (e) {
            reject(new Error('上传响应解析失败'));
          }
        } else {
          reject(new Error(`上传失败（${res.statusCode}）`));
        }
      },
      fail: (err) => reject(new Error(err.errMsg)),
    });
  });
}

// ---------- 异常事件（只读） ----------

export interface EventListQuery {
  status?: EventStatus;
  reachId?: string;
  page?: number;
  pageSize?: number;
}

export function listEvents(query: EventListQuery = {}): Promise<PageResult<ActiveEvent>> {
  return request<PageResult<ActiveEvent>>(
    `/api/events${toQuery(query as Record<string, string | number | undefined>)}`,
  );
}

/** 事件详情含时间线/证据/假设，M3 后端定稿后补 EventDetail 类型 */
export function getEventDetail(eventId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/events/${encodeURIComponent(eventId)}`);
}

// ---------- 监测点（只读） ----------

export function listReaches(): Promise<Reach[]> {
  return request<Reach[]>('/api/reaches');
}

export function getReach(reachId: string): Promise<Reach> {
  return request<Reach>(`/api/reaches/${encodeURIComponent(reachId)}`);
}

export function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/api/health', { anonymous: true });
}

/** M3 由 app 启动时调用；M0 仅导出不自动连接 */
export function connectRealtime(): void {
  wsClient.connect();
  logger.info('api', 'ws connect requested');
}
