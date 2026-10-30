// services/api.ts - 小程序业务接口（与 PC Web 共用同一后端契约）
// M0 为骨架；M3 后端接口就绪后对接，路径以 GRP V2.1 第 8 章契约为准。

import { request } from '../utils/request';
import { saveSession, getToken } from '../utils/auth';
import { wsClient } from '../utils/ws';
import { ENV } from '../config/env';
import { logger } from '../utils/logger';

/** 拼 query string（小程序基础库不保证 URLSearchParams 可用） */
function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface ReviewBrief {
  decision: 'APPROVED' | 'REJECTED' | string;
  comment: string;
  reviewer: string;
  reviewedAt: string;
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
  observedAt?: string | null;
  completedAt: string | null;
  createdAt: string;
  draft?: boolean;
  latestVersion?: number;
  latestReview?: ReviewBrief | null;
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
  eventId?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}

export function listTasks(query: TaskListQuery = {}): Promise<PageResult<InspectionTask>> {
  return request<PageResult<InspectionTask>>(
    `/api/inspection-tasks${toQuery(query as Record<string, string | number | boolean | undefined>)}`,
  );
}

export function getTask(taskId: string): Promise<InspectionTask> {
  return request<InspectionTask>(`/api/inspection-tasks/${encodeURIComponent(taskId)}`);
}

/** 提交版本列表（只读） */
export function listSubmissions(taskId: string): Promise<unknown[]> {
  return request<unknown[]>(`/api/inspection-tasks/${encodeURIComponent(taskId)}/submissions`);
}

/** 复核记录列表（只读，含 APPROVED/REJECTED 与意见） */
export function listReviews(taskId: string): Promise<unknown[]> {
  return request<unknown[]>(`/api/inspection-tasks/${encodeURIComponent(taskId)}/reviews`);
}

/** 任务统一时间线条目（只读 business_events；节点真实性依据，非按最终状态反推） */
export interface TaskTimelineItem {
  actionType: string;
  actor?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  description?: string | null;
  occurredAt: string;
  source?: string;
}

export function listTaskTimeline(taskId: string): Promise<{ items: TaskTimelineItem[] }> {
  return request<{ items: TaskTimelineItem[] }>(
    `/api/inspection-tasks/${encodeURIComponent(taskId)}/timeline`,
  );
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

export interface ManualMeasurement {
  metric: 'waterLevel' | 'turbidity' | 'flowLevel' | string;
  value: number | null;
  unit: string;
  /** 人工测量固定 MANUAL，区别于传感器链路 */
  sourceType: 'MANUAL';
  /** value=null 时的未测原因（安全无法靠近等） */
  unmeasuredReason?: string;
}

export interface UnmeasuredReason {
  metric: string;
  reason: string; // 安全无法靠近 / 设备故障 / 点位被淹没 / 天气能见度 / 其他
}

export interface TaskResultPayload {
  observationNote: string;
  observedAt: string; // ISO 8601，现场观测时间
  attachmentIds?: string[];
  /** 现场结论（人工确认，不伪装为模型输出） */
  conclusion?: string;
  /** 若现场认为应触发再评估，由后端决定是否执行 */
  requestReevaluate?: boolean;
  /** 本次提交的人工复测指标（结构化，后端 free-form JSON 原样存取） */
  measurements?: ManualMeasurement[];
}

/** 要求项未测量的原因（M2 记录页本地结构；后端无独立字段，提交时并入观察记录文本） */
export interface UnmeasuredReason {
  metric: string;
  reason: string; // 安全无法靠近 / 设备故障 / 点位被淹没 / 天气能见度 / 其他
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
    `/api/events${toQuery(query as Record<string, string | number | boolean | undefined>)}`,
  );
}

export function getEventDetail(eventId: string): Promise<EventDetail> {
  return request<EventDetail>(`/api/events/${encodeURIComponent(eventId)}`);
}

/** 统一业务时间线（business_events，可按 bizType 逗号过滤） */
export function listEventTimeline(
  eventId: string,
  types?: string,
): Promise<{ items: TimelineItem[] }> {
  const qs = types ? `?types=${encodeURIComponent(types)}` : '';
  return request<{ items: TimelineItem[] }>(
    `/api/events/${encodeURIComponent(eventId)}/timeline${qs}`,
  );
}

/** 规则处置建议（非 AI） */
export function listRecommendations(
  eventId: string,
): Promise<{ source: string; ruleVersion: string; items: EventRecommendation[] }> {
  return request(`/api/events/${encodeURIComponent(eventId)}/recommendations`);
}

/** 恢复评估（后端纯函数即时计算） */
export function getRecoveryAssessment(eventId: string): Promise<RecoveryAssessment> {
  return request<RecoveryAssessment>(
    `/api/events/${encodeURIComponent(eventId)}/recovery-assessment`,
  );
}

// ---------- 监测盲区（只读） ----------

export function listBlindSpots(query: { active?: boolean; reachId?: string } = {}): Promise<BlindSpot[]> {
  return request<BlindSpot[]>(
    `/api/blind-spots${toQuery({ active: query.active, reachId: query.reachId })}`,
  );
}

// ---------- 监测点与观测（只读） ----------

export function listReaches(): Promise<Reach[]> {
  return request<Reach[]>('/api/reaches');
}

export function getReach(reachId: string): Promise<Reach> {
  return request<Reach>(`/api/reaches/${encodeURIComponent(reachId)}`);
}

/** 每个指标的最新一条有效观测 */
export function listLatestMetrics(reachId: string): Promise<Observation[]> {
  return request<Observation[]>(`/api/reaches/${encodeURIComponent(reachId)}/latest`);
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

export function listObservations(
  reachId: string,
  query: ObservationQuery = {},
): Promise<PageResult<Observation>> {
  return request<PageResult<Observation>>(
    `/api/reaches/${encodeURIComponent(reachId)}/observations${toQuery(
      query as Record<string, string | number | boolean | undefined>,
    )}`,
  );
}

/** 国家地表水自动站快照（非连续实时数据，必须独立分区展示） */
export function listOfficialAuto(): Promise<OfficialAutoGroup[]> {
  return request<OfficialAutoGroup[]>('/api/official/auto');
}

// ---------- 当前用户 ----------

export function getMe(): Promise<User> {
  return request<User>('/api/auth/me');
}

export function healthCheck(): Promise<{ status: string; version?: string; database?: string }> {
  return request<{ status: string; version?: string; database?: string }>('/api/health', {
    anonymous: true,
  });
}

// ---------- 系统与演示中心（只读） ----------

/** 运行诊断（在线/陈旧/离线断面、观测计数、规则版本、MQTT 配置）。公网部署可能 403，调用方需容错 */
export interface SystemDiagnostics {
  appVersion?: string;
  ruleVersion?: string;
  ruleLabel?: string | null;
  mqtt?: { enabled: boolean; host: string; port: number; topicPrefix: string; staleSeconds: number };
  counts?: {
    reachesOnline: number;
    reachesStale: number;
    reachesOffline: number;
    observations: number;
    processedMessages: number;
    duplicateMessages: number;
    ingestionErrors: number;
  };
}

export function getDiagnostics(): Promise<SystemDiagnostics> {
  return request<SystemDiagnostics>('/api/admin/diagnostics');
}

/** 演示场景运行状态（只读；启停属管理员写操作，现场端不调用） */
export function getScenarioStatus(): Promise<{ running: boolean; scenario: string | null }> {
  return request<{ running: boolean; scenario: string | null }>('/api/admin/scenarios/status');
}

/** 官方自动监测数据开关与来源说明（只读） */
export interface OfficialStatus {
  enabled: boolean;
  sourceLabel?: string;
  cacheMinutes?: number;
  staleMinutes?: number;
}

export function getOfficialStatus(): Promise<OfficialStatus> {
  return request<OfficialStatus>('/api/official/auto/status');
}

// ---------- 站内通知（V2.2 PC 复核 → 小程序） ----------

export interface TaskNotification {
  notificationId: string;
  type: 'TASK_REJECTED' | 'TASK_APPROVED' | string;
  title: string;
  body: string;
  taskId: string;
  submissionId?: string | null;
  version?: number;
  reviewId?: string | null;
  isRead: boolean;
  createdAt?: string | null;
}

export function listNotifications(unreadOnly = false): Promise<{ items: TaskNotification[] }> {
  return request<{ items: TaskNotification[] }>(
    `/api/notifications${unreadOnly ? '?unreadOnly=true' : ''}`,
  );
}

export function getUnreadCount(): Promise<{ unread: number }> {
  return request<{ unread: number }>('/api/notifications/unread-count');
}

/** 进入任务详情时按任务批量已读；返回更新条数与最新未读数 */
export function markNotificationsRead(query: { notificationId?: string; taskId?: string }): Promise<{ updated: number; unread: number }> {
  return request('/api/notifications/mark-read', { method: 'POST', data: query });
}

/** M3 由 app 启动时调用；M0 仅导出不自动连接 */
export function connectRealtime(): void {
  wsClient.connect();
  logger.info('api', 'ws connect requested');
}
