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
  allowedActions: EventAction[];
}

/** 统一业务时间线条目（business_events）。 */
export interface TimelineItem {
  eventId: string;
  bizType: 'EVENT' | 'TASK' | 'SUBMISSION' | 'REVIEW' | 'ASSESSMENT' |
    'EVIDENCE' | 'BLINDSPOT' | 'ATTACHMENT' | 'RECOVERY';
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
  evidenceRefs: unknown[];
  occurredAt: string;
  source: 'live' | 'backfill';
}

/** 规则处置建议（非 AI）。 */
export interface Recommendation {
  code: string;
  category: 'EVENT_ACTION' | 'TASK' | 'REVIEW' | 'BLINDSPOT' | 'EVIDENCE' | 'CLOSE';
  title: string;
  reason: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  taskId?: string | null;
  reachIds?: string[];
  scopeReachIds?: string[];
  eventAction?: EventAction | null;
  suggestedTask?: { actionType: string; reachId: string } | null;
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

/** F3 复盘详情使用的完整 review payload（任务内嵌版本/复核）。 */
export interface ReviewBlindSpot {
  reachId: string;
  resolved: boolean;
  reason: string;
  impact?: string | null;
}
export interface EventReviewDetail extends Omit<EventReview, 'tasks'> {
  tasks: ReviewTaskRecord[];
  taskSubmissions: ReviewSubmission[];
  taskReviews: TaskReviewRecord[];
  blindSpots?: ReviewBlindSpot[];
  focuses?: unknown[];
}

export interface ImportRowView {
  rowNo: number;
  raw: Record<string, string>;
  normalized: Record<string, unknown>;
  matchedReachId: string | null;
  errors: string[];
  warnings: string[];
}
export interface ImportPreview {
  batchId: string;
  sourceKind: string;
  originalFilename: string;
  agency: string | null;
  sourceUrl: string | null;
  publishedPeriod: string | null;
  publishedAt: string | null;
  status: 'PREVIEW' | 'CONFIRMED' | 'REVOKED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ImportRowView[];
}
export interface ImportBatch {
  batchId: string;
  sourceKind: string;
  originalFilename: string;
  agency: string | null;
  sourceUrl: string | null;
  publishedPeriod: string | null;
  publishedAt: string | null;
  status: 'PREVIEW' | 'CONFIRMED' | 'REVOKED';
  rowCount: number;
  importedBy: string | null;
  createdAt: string;
}
export interface ImportConfirmMeta {
  agency?: string;
  sourceUrl?: string;
  publishedAt?: string;
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
  | 'DRAFT' | 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS'
  | 'SUBMITTED' | 'APPROVED' | 'CANCELLED';

export interface TaskReviewBrief {
  decision: 'APPROVED' | 'REJECTED';
  comment: string;
  reviewer: string;
  reviewedAt: string;
}

export interface TaskSubmission {
  submissionId: string;
  taskId: string;
  version: number;
  observationNote: string;
  conclusion: 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN';
  measurements: unknown[];
  observedAt: string;
  attachmentIds: string[];
  submittedBy: string;
  submittedAt: string;
  supersededAt: string | null;
}

export interface TaskReviewRecord {
  reviewId: string;
  taskId?: string;
  submissionId: string;
  version: number;
  decision: 'APPROVED' | 'REJECTED';
  comment: string;
  reviewer: string;
  reviewedAt: string;
}

/** review payload 中任务内嵌的提交版本（含所属任务）。 */
export type ReviewSubmission = TaskSubmission & { taskId?: string };
export interface ReviewTaskRecord {
  id: string;
  reachId: string;
  title: string;
  status: InspectionTaskStatus;
  conclusion: 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN' | null;
  note: string | null;
  submissions: TaskSubmission[];
  reviews: TaskReviewRecord[];
}

export interface RecoveryFactor {
  code: string;
  passed: boolean | null;
  weight: string;
  detail: string;
  sources: string[];
}
export interface RecoveryWindow {
  reachId: string;
  metric: string;
  phase: 'BASELINE' | 'ANOMALY' | 'POST';
  start: string | null;
  end: string | null;
  sampleCount: number;
  median: number | null;
  mean: number | null;
  p05: number | null;
  p95: number | null;
  unit: string;
  sourceType: string;
  badQuality: number;
  exceedRatio: number | null;
  threshold: number | number[] | null;
  anomalyPeak: number | null;
}
export interface RecoveryAssessment {
  eventId: string;
  result: 'RECOVERED_SUPPORTED' | 'NEEDS_OBSERVATION' | 'INSUFFICIENT_EVIDENCE';
  label: string;
  evaluatedAt: string;
  ruleVersion: string;
  currentStatus: EventStatus;
  anchor: { at: string | null; source: string | null; note: string };
  factors: RecoveryFactor[];
  windows: RecoveryWindow[];
  disclaimers: string[];
}

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
  draft?: boolean;
  latestVersion?: number;
  latestReview?: TaskReviewBrief | null;
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
