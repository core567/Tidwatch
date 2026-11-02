import type { RiskLevel, Station, StationId } from '../../types';

export type AssessmentStatus = '待研判' | '研判中' | '处置中' | '待复核' | '已闭环';
export type EvidenceType = 'metric' | 'sensor' | 'report' | 'photo';

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  title: string;
  desc: string;
  time: string;
  value?: string;
  spark?: number[];
}

export interface Hypothesis {
  title: string;
  /** 真实假设无置信度口径时为 null（显示"—"，不编造） */
  confidence: number | null;
  basis: string;
  selected?: boolean;
}

export interface TimelineStep {
  time: string;
  actor: string;
  action: string;
  note: string;
  state: 'done' | 'active' | 'todo';
  /** 原始业务类型（用于关键节点/系统日志分组） */
  bizType?: string;
}

export interface Suggestion {
  priority: '高' | '中' | '低';
  title: string;
  desc: string;
  action: string;
}

export interface LinkedTask {
  id: string;
  title: string;
  assignee: string;
  status: string;
  time: string;
}

export interface AssessmentEvent {
  id: string;
  title: string;
  stationId: StationId;
  risk: RiskLevel;
  status: AssessmentStatus;
  occurredAt: string;
  elapsed: string;
  location: string;
  summary: string;
  reading: {
    label: string;
    value: string;
    unit: string;
    delta: string;
    tone: 'alert' | 'watch' | 'good';
  };
  evidence: EvidenceItem[];
  hypotheses: Hypothesis[];
  timeline: TimelineStep[];
  suggestions: Suggestion[];
  linkedTask?: LinkedTask;
  coordinates: string;
  /** 原始八态状态值（与视觉分组同时展示，不改状态机） */
  originalStatus: string;
  riskCode: string;
  riskLabel: string;
}

export interface AssessmentData {
  demo: true;
  updatedAt: string;
  stations: Station[];
  events: AssessmentEvent[];
}
