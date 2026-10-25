// 与后端 Pydantic 契约对齐（M0 手工同步；M1 起由 openapi.json 自动生成）

export type SourceType =
  | 'OFFICIAL_PUBLIC'
  | 'OFFICIAL_AUTO'
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

export interface EventTrigger {
  reachId: string;
  metric: string;
  magnitude: number;
  direction: 'UP' | 'DOWN' | 'LEVEL';
  ruleId: string;
}

export interface ActiveEvent {
  eventId: string;
  title: string;
  eventType: string;
  status: EventStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  scopeReachIds: string[];
  trigger?: EventTrigger | null;
  firstSeenAt: string;
  updatedAt: string;
  version: number;
  ruleVersion: string;
}

export interface StatusTransition {
  fromStatus: EventStatus | null;
  toStatus: EventStatus;
  trigger: 'RULE' | 'MANUAL' | 'SCENARIO';
  reason: string | null;
  actor: string;
  ruleVersion: string;
  createdAt: string;
}

export interface TemporalRelation {
  relationId: string;
  fromChangeId: string;
  toChangeId: string;
  deltaSeconds: number;
  relationType: string;
  evidenceState: string;
  createdAt: string;
}

export interface EventDetail extends ActiveEvent {
  transitions: StatusTransition[];
  temporalRelations: TemporalRelation[];
  changeCount: number;
}

export interface ReviewHypothesis {
  id: string;
  statement: string;
  state: string;
  support: number;
  counter: number;
}
export interface ReviewAssessment {
  version: number;
  previousScope: string[];
  currentScope: string[];
  reason: string | null;
  warnings: string[];
  trigger: string | null;
}
export interface ReviewEvidence {
  id: string;
  type: string;
  polarity: string;
  note: string | null;
  sourceRef: string;
  by: string;
  at: string | null;
}
export interface EventReview {
  eventId: string;
  title: string;
  status: EventStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  eventType: string;
  ruleVersion: string;
  firstSeenAt: string | null;
  updatedAt: string | null;
  scope: string[];
  scopeHistory: { version: number; reaches: string[]; reason: string | null }[];
  temporalRelations: { deltaSeconds: number; note: string }[];
  hypotheses: ReviewHypothesis[];
  assessments: ReviewAssessment[];
  supportingEvidence: ReviewEvidence[];
  counterEvidence: ReviewEvidence[];
  unresolved: string[];
  trace: { actor: string; action: string; detail: string | null }[];
  tasks: { title: string; status: string; conclusion: string | null }[];
  disclaimer: string;
}

export interface MonthlyStats {
  totalRecords: number;
  totalBatches: number;
  byClass: Record<string, number>;
  byReach: Record<string, number>;
  byPeriod: Record<string, number>;
  batches: {
    batchId: string; period: string; agency: string | null; status: string;
    rowCount: number; sourceUrl: string | null; createdAt: string | null;
  }[];
}

export interface EventFrequency {
  totalEvents: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  eventsPerReach: Record<string, number>;
}

export type InspectionTaskStatus =
  | 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';

export interface InspectionTask {
  taskId: string;
  eventId: string | null;
  focusId: string | null;
  reachId: string;
  actionType: string;
  title: string;
  priority: string;
  status: InspectionTaskStatus;
  assignee: string | null;
  dueAt: string | null;
  reason: string;
  resultNote: string | null;
  resultConclusion: 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN' | null;
  attachmentIds: string[];
  observedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Evidence {
  evidenceId: string;
  eventId: string;
  type: 'OBSERVATION' | 'RULE' | 'MANUAL' | 'EXTERNAL' | 'MODEL' | 'KNOWLEDGE';
  sourceRef: string;
  polarity: 'SUPPORT' | 'COUNTER' | 'MISSING';
  qualityFlag: string | null;
  note: string | null;
  createdBy: string;
  observedAt: string | null;
  createdAt: string;
}

export interface Hypothesis {
  hypothesisId: string;
  eventId: string;
  statement: string;
  state: 'OPEN' | 'PARTIAL_SUPPORT' | 'SUPPORT' | 'NOT_SUPPORT' | 'UNKNOWN';
  supportRefs: string[];
  counterRefs: string[];
  createdAt: string;
}

export interface Assessment {
  id: number;
  eventId: string;
  assessmentVersion: number;
  ruleVersion: string;
  previousScope: string[];
  currentScope: string[];
  scopeChangeReason: string | null;
  hypothesisChanges: unknown[];
  taskSuggestions: string[];
  warnings: string[];
  triggerReason: string | null;
  createdAt: string;
}

export interface BlindSpot {
  blindSpotId: string;
  eventId: string | null;
  reachId: string;
  startAt: string;
  endAt: string | null;
  reason: string;
  impact: string | null;
  resolution: string | null;
}

export type EventAction =
  | 'START_INVESTIGATION'
  | 'ESCALATE'
  | 'KEEP_MONITORING'
  | 'NARROW_SCOPE'
  | 'MARK_RECOVERY_PENDING'
  | 'CONFIRM_RECOVERED'
  | 'MARK_UNRESOLVED'
  | 'REOPEN';

export interface StreamMessage<T = unknown> {
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
  sentAt: string;
  payload: T;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  database: 'ok' | 'error';
}

// ---------- 官方自动监测实时水质（OFFICIAL_AUTO，独立于 MQTT 模拟） ----------

export type OfficialDataState = 'LIVE' | 'STALE' | 'NO_DATA';

export interface OfficialAutoRecord {
  stationName: string;
  reachId: string | null;
  mappingStatus: 'UNVERIFIED' | 'VERIFIED' | string;
  province: string | null;
  basin: string | null;
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
  dataState: 'LIVE' | 'STALE';
  ageMinutes: number | null;
  sourceLabel: string;
  sourceUrl: string | null;
}

export interface OfficialAutoLatest {
  reachId: string;
  stationName: string;
  mappingNote: string | null;
  dataState: OfficialDataState;
  records: OfficialAutoRecord[];
}

export interface OfficialAutoFetchInfo {
  fetchId: string;
  fetchedAt: string;
  ok: boolean;
  stationCount: number;
  recordCount: number;
  durationMs: number | null;
  message: string | null;
}

export interface OfficialAutoStatus {
  enabled: boolean;
  cacheMinutes: number;
  staleMinutes: number;
  sourceLabel: string;
  sourceUrl: string;
  stations: { stationName: string; reachId: string; note: string }[];
  lastFetch: OfficialAutoFetchInfo | null;
}

export interface OfficialAutoSyncResult {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  fetchedAt: string | null;
  nextAllowedAt: string | null;
  stationsOk: number;
  stationsTotal: number;
  recordsInserted: number;
  recordsSkipped: number;
  errors: string[];
}
