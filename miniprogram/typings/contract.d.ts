// typings/contract.d.ts
// 前后端共享契约骨架（M0）。
// WP1 后端 OpenAPI 定稿后，由 scripts/gen-contract-types 重新生成为权威版本；
// 此处先按 GRP V2.1 第 3/8 章定义最小可用类型，供小程序页面与服务层编译。

/** 数据来源类型（GRP 6.3，六类必须显式区分） */
declare type SourceType =
  | 'OFFICIAL_PUBLIC' // 官方公开历史资料（月度水质类别等）
  | 'SIMULATED' // MQTT 模拟连续数据（S1–S5 / MQTTX）
  | 'EXTERNAL' // 外部可选数据（如降雨，M3）
  | 'RULE_OUTPUT' // 规则引擎输出
  | 'MODEL_OUTPUT' // 轻量模型输出（辅助，不驱动状态机）
  | 'MANUAL'; // 人工巡检记录

declare type QualityFlag = 'GOOD' | 'SUSPECT' | 'INVALID' | 'MISSING' | 'STALE';

/** GRP 5.1 活动事件状态机（8 态，后端统一执行迁移） */
declare type EventStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'MONITORING'
  | 'ESCALATED'
  | 'NARROWED'
  | 'RECOVERY_PENDING'
  | 'RECOVERED'
  | 'UNRESOLVED';

declare type ReachRole = 'upstream' | 'midstream' | 'downstream';

declare type ReachOnlineStatus = 'ONLINE' | 'STALE' | 'OFFLINE';

/** 统一错误结构（GRP 7.4：code/message/details/requestId） */
declare interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

declare interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

declare interface User {
  userId: string;
  username: string;
  displayName: string;
  role: 'admin' | 'analyst' | 'inspector';
}

declare interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string; // ISO 8601
  user: User;
}

declare interface Reach {
  reachId: string; // reach-a / reach-b / reach-c
  name: string; // 上游 A / 中游 B / 下游 C（逻辑点名）
  role: ReachRole;
  topoOrder: number;
  onlineStatus: ReachOnlineStatus;
  /** 后端字段为 lastSeenAt（最后有效观测的业务时间，迟到数据不回滚） */
  lastSeenAt: string | null;
  coordinateStatus: 'LOGICAL' | 'VERIFIED';
  longitude?: number | null;
  latitude?: number | null;
  coordinateSource?: string | null;
  officialCandidateName?: string | null; // 新沟 / 宗关 / 龙王庙（仅候选，未核实）
}

declare interface Observation {
  observationId: string;
  reachId: string;
  metric: string;
  value: number;
  unit: string;
  observedAt: string;
  ingestedAt: string;
  sourceType: SourceType;
  sourceName?: string | null;
  sourceRef?: string | null;
  scenarioId: string | null;
  qualityFlag: QualityFlag;
  ruleVersion: string;
}

/** 国家地表水自动监测实时数据发布系统快照（月度/拉取时点，非连续实时数据） */
declare interface OfficialAutoRecord {
  stationName: string;
  reachId: string;
  mappingStatus: 'VERIFIED' | 'UNVERIFIED' | string;
  province?: string;
  basin?: string;
  observedAt: string;
  fetchedAt: string;
  waterClass: string | null;
  waterTemp: number | null;
  ph: number | null;
  dissolvedOxygen: number | null;
  conductivity: number | null;
  turbidity: number | null;
  codMn: number | null;
  ammoniaN: number | null;
  totalPhosphorus: number | null;
  totalNitrogen: number | null;
  chlorophyllA: number | null;
  algaeDensity: number | null;
  dataState: 'FRESH' | 'STALE' | string;
  ageMinutes?: number | null;
  sourceLabel?: string;
  sourceUrl?: string;
}

declare interface OfficialAutoGroup {
  reachId: string;
  records: OfficialAutoRecord[];
}

/** 监测盲区（链路中断等导致的不可观察时段） */
declare interface BlindSpot {
  blindSpotId: string;
  eventId: string | null;
  reachId: string;
  startAt: string;
  endAt: string | null;
  reason: string;
  impact?: string | null;
  resolution?: string | null;
}

/** 事件触发信息 */
declare interface EventTrigger {
  reachId: string;
  metric: string;
  magnitude: number;
  direction: 'UP' | 'DOWN' | string;
  ruleId: string;
}

declare interface EventTransition {
  fromStatus: EventStatus | null;
  toStatus: EventStatus;
  trigger: 'RULE' | 'MANUAL' | 'SCENARIO' | string;
  reason: string | null;
  actor: string;
  ruleVersion: string;
  createdAt: string;
}

declare type TaskActionType =
  | 'CONTINUE_OBSERVE'
  | 'FOCUS_REACH_B'
  | 'FOCUS_REACH_C'
  | 'KEEP_LOCAL_SCOPE'
  | 'INSPECT_DATA_LINK'
  | 'MANUAL_CHECK'
  | 'RE_EVALUATE_AFTER_RECOVERY';

declare type TaskStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'CANCELLED';

declare interface ReviewBrief {
  decision: 'APPROVED' | 'REJECTED' | string;
  comment: string;
  reviewer: string;
  reviewedAt: string;
}

declare interface InspectionTask {
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

declare interface ActiveEvent {
  eventId: string; // TW-E01 风格
  title: string;
  eventType?: string;
  status: EventStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  scopeReachIds: string[];
  trigger?: EventTrigger | null;
  firstSeenAt: string;
  updatedAt: string;
  version: number;
  ruleVersion: string;
}

/** GET /events/{id} 详情 */
declare interface EventDetail extends ActiveEvent {
  transitions: EventTransition[];
  changeCount?: number;
  allowedActions?: string[];
}

/** 统一业务时间线条目（business_events） */
declare interface TimelineItem {
  eventId: string;
  bizType: 'EVENT' | 'TASK' | 'SUBMISSION' | 'REVIEW' | 'ASSESSMENT' | string;
  actionType: string;
  eventRef: string | null;
  taskRef: string | null;
  submissionRef: string | null;
  reviewRef: string | null;
  actor: string;
  actorRole: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  description: string | null;
  occurredAt: string;
  createdAt: string;
}

/** 规则处置建议（非 AI） */
declare interface EventRecommendation {
  code: string;
  category: string;
  title: string;
  reason: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | string;
  reachIds?: string[];
}

/** 恢复评估因子 */
declare interface RecoveryFactor {
  code: string;
  passed: boolean;
  weight: 'hard' | 'soft' | string;
  detail: string;
}
declare interface RecoveryAssessment {
  result: 'RECOVERED_SUPPORTED' | 'NEEDS_OBSERVATION' | 'INSUFFICIENT_EVIDENCE' | string;
  label: string;
  evaluatedAt: string;
  ruleVersion: string;
  currentStatus: EventStatus;
  anchor: { at: string; source: string; note: string } | null;
  factors: RecoveryFactor[];
}

declare interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

/** 小程序 WS /api/ws 与 PC SSE 共用的消息信封（GRP 8.3 扩展） */
declare interface StreamTaskPayload {
  taskId?: string;
  eventId?: string;
  reachId?: string;
  status?: string;
  assignee?: string | null;
}

declare interface StreamMessage<T = unknown> {
  messageId: string;
  messageType:
    | 'observation.created'
    | 'change.detected'
    | 'event.created'
    | 'event.updated'
    | 'event.status-changed'
    | 'focus.updated'
    | 'focus.resolved'
    | 'blindspot.created'
    | 'blindspot.opened'
    | 'blindspot.resolved'
    | 'task.created'
    | 'task.updated'
    | 'reach.status-changed'
    | 'ping';
  scenarioId: string | null;
  sentAt: string; // ISO 8601
  payload: T;
}
