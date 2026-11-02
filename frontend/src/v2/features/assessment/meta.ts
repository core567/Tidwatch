import type { AssessmentStatus, EvidenceType } from './assessmentTypes';
import type { RiskLevel } from '../../types';
import type { IconName } from '../../components/ui/Icon';

export const RISK_CODE: Record<RiskLevel, string> = {
  high: 'R3',
  medium: 'R2',
  low: 'R1',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

export const STATUS_KEY: Record<AssessmentStatus, string> = {
  待研判: 'pending',
  研判中: 'assessing',
  处置中: 'handling',
  待复核: 'review',
  已闭环: 'closed',
};

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  metric: '指标数据',
  sensor: '传感设备',
  report: '现场反馈',
  photo: '现场影像',
};

export const EVIDENCE_ICON: Record<EvidenceType, IconName> = {
  metric: 'analysis',
  sensor: 'wave',
  report: 'review',
  photo: 'camera',
};

export const CASE_STAGES = ['发现', '研判', '派发', '现场', '复核'];

export const STAGE_BY_STATUS: Record<AssessmentStatus, number> = {
  待研判: 1,
  研判中: 1,
  处置中: 3,
  待复核: 4,
  已闭环: 5,
};

/** 原后端八态 → 五类视觉分组（仅展示分组；原始状态值同时显示，不改状态机） */
export const EVENT_STATUS_GROUP: Record<string, AssessmentStatus> = {
  OPEN: '待研判',
  INVESTIGATING: '研判中',
  MONITORING: '研判中',
  ESCALATED: '处置中',
  NARROWED: '处置中',
  RECOVERY_PENDING: '待复核',
  RECOVERED: '已闭环',
  UNRESOLVED: '已闭环',
};
/** 已闭环内部的原始状态区分（RECOVERED/UNRESOLVED 不得混为成功结案） */
export const CLOSED_STATUS_LABEL: Record<string, string> = {
  RECOVERED: '已恢复',
  UNRESOLVED: '无法判定',
};
