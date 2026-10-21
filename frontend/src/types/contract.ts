// 与后端 Pydantic 契约对齐（M0 手工同步；M1 起由 openapi.json 自动生成）

export type SourceType =
  | 'OFFICIAL_PUBLIC'
  | 'SIMULATED'
  | 'EXTERNAL'
  | 'RULE_OUTPUT'
  | 'MODEL_OUTPUT'
  | 'MANUAL';

export type QualityFlag = 'GOOD' | 'SUSPECT' | 'INVALID' | 'MISSING' | 'STALE';

export type EventStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'MONITORING'
  | 'ESCALATED'
  | 'NARROWED'
  | 'RECOVERY_PENDING'
  | 'RECOVERED'
  | 'UNRESOLVED';

export type ReachOnlineStatus = 'ONLINE' | 'STALE' | 'OFFLINE';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface User {
  userId: string;
  username: string;
  displayName: string;
  role: 'admin' | 'analyst' | 'inspector';
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: User;
}

export interface Reach {
  reachId: string;
  name: string;
  role: 'upstream' | 'midstream' | 'downstream';
  topoOrder: number;
  onlineStatus: ReachOnlineStatus;
  lastSeenAt: string | null;
  coordinateStatus: 'LOGICAL' | 'VERIFIED';
  longitude?: number | null;
  latitude?: number | null;
  coordinateSource?: string | null;
  officialCandidateName?: string | null;
}

export interface Observation {
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
  scenarioId?: string | null;
  qualityFlag: QualityFlag;
  ruleVersion: string;
}

export interface ActiveEvent {
  eventId: string;
  title: string;
  eventType: string;
  status: EventStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  scopeReachIds: string[];
  firstSeenAt: string;
  updatedAt: string;
  version: number;
  ruleVersion: string;
}

export interface StreamMessage<T = unknown> {
  messageId: string;
  messageType:
    | 'observation.created'
    | 'change.detected'
    | 'event.created'
    | 'event.updated'
    | 'event.status-changed'
    | 'focus.updated'
    | 'blindspot.created'
    | 'blindspot.resolved'
    | 'task.created'
    | 'task.updated'
    | 'reach.status-changed'
    | 'ping';
  scenarioId: string | null;
  sentAt: string;
  payload: T;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  database: 'ok' | 'error';
}
