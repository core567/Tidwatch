/**
 * TideWatch 3D 场景最小类型契约（从主项目 frontend/src/types/contract.ts 精简）。
 * 集成回主项目时，这些类型与 src/types/contract.ts 中的定义保持一致，
 * 届时可删除本文件并恢复 `import type { Reach } from '@/types/contract'`。
 */

export type ReachOnlineStatus = 'ONLINE' | 'STALE' | 'OFFLINE';

export interface Reach {
  reachId: string;
  name: string;
  role: 'upstream' | 'midstream' | 'downstream';
  topoOrder: number;
  onlineStatus: ReachOnlineStatus;
  lastSeenAt: string | null;
}

export interface Observation {
  observationId: string;
  reachId: string;
  metric: string;
  value: number;
  unit: string;
  observedAt: string;
  ingestedAt: string;
  sourceType: string;
  qualityFlag: string;
}

export interface ActiveEvent {
  eventId: string;
  title: string;
  status: string;
  priority: string;
  firstSeenAt: string;
  trigger?: { metric: string; direction: string; magnitude: number } | null;
}
