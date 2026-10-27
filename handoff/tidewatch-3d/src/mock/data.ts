import type { Reach, ActiveEvent, Observation } from '../types/contract';

/**
 * 独立运行用的示例数据（非 TideWatch 真实数据）。
 * 集成回主项目后，这些数据改由 api.reaches()/api.latest()/api.events() 提供，
 * 组件 RiverScene / MonitorNode 的 props 接口保持不变。
 */
export const mockReaches: Reach[] = [
  { reachId: 'reach-a', name: '上游 A', role: 'upstream', topoOrder: 1, onlineStatus: 'ONLINE', lastSeenAt: new Date().toISOString() },
  { reachId: 'reach-b', name: '中游 B', role: 'midstream', topoOrder: 2, onlineStatus: 'ONLINE', lastSeenAt: new Date().toISOString() },
  { reachId: 'reach-c', name: '下游 C', role: 'downstream', topoOrder: 3, onlineStatus: 'STALE', lastSeenAt: new Date(Date.now() - 10 * 60000).toISOString() },
];

export const mockAbnormal = ['reach-a'];

export const mockObservations: Record<string, Observation[]> = {
  'reach-a': [
    { observationId: 'o-1', reachId: 'reach-a', metric: 'waterLevel', value: 4.78, unit: 'm', observedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), sourceType: 'SIMULATED', qualityFlag: 'GOOD' },
    { observationId: 'o-2', reachId: 'reach-a', metric: 'turbidity', value: 21.79, unit: 'NTU', observedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), sourceType: 'SIMULATED', qualityFlag: 'GOOD' },
    { observationId: 'o-3', reachId: 'reach-a', metric: 'flowLevel', value: 1, unit: '级', observedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), sourceType: 'SIMULATED', qualityFlag: 'GOOD' },
  ],
  'reach-b': [
    { observationId: 'o-4', reachId: 'reach-b', metric: 'waterLevel', value: 4.29, unit: 'm', observedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), sourceType: 'SIMULATED', qualityFlag: 'GOOD' },
  ],
  'reach-c': [],
};

export const mockEvents: Record<string, ActiveEvent[]> = {
  'reach-a': [
    { eventId: 'TW-DEMO', title: '示例：上游水位持续偏高', status: 'INVESTIGATING', priority: 'HIGH', firstSeenAt: new Date().toISOString(), trigger: { metric: 'waterLevel', direction: 'UP', magnitude: 2.0 } },
  ],
  'reach-b': [],
  'reach-c': [],
};
