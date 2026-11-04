import type { ReachOnlineStatus } from '@/types/contract';

export type NodeVisualStatus = 'normal' | 'watch' | 'abnormal' | 'recovery' | 'offline';

export const NODE_VISUAL_COLORS: Record<NodeVisualStatus, string> = {
  normal: '#17B8A6',
  watch: '#F3A53A',
  abnormal: '#E65A60',
  recovery: '#F28C38',
  offline: '#8DA2B8',
};

export const NODE_VISUAL_LABELS: Record<NodeVisualStatus, string> = {
  normal: '正常',
  watch: '关注',
  abnormal: '异常',
  recovery: '恢复观察',
  offline: '离线',
};

export interface NodeVisualEvent {
  eventId: string;
  title: string;
  status: string;
  scopeReachIds: string[];
}

export interface NodeVisualState {
  tier: NodeVisualStatus;
  /** 链路离线与事件状态同时存在时，主色仍按事件状态显示，标签补充“离线”。 */
  offline: boolean;
  eventId?: string;
  eventTitle?: string;
  eventStatus?: string;
}

/**
 * 由真实断面链路状态与活动事件范围推导节点视觉等级。
 * 优先级：异常 > 恢复观察 > 关注 > 离线 > 正常。
 * 不按 A/B/C 硬编码任何状态。
 */
export function buildNodeVisualMap(
  reaches: { reachId: string; onlineStatus: ReachOnlineStatus | string }[],
  events: NodeVisualEvent[] = [],
): Record<string, NodeVisualState> {
  const map: Record<string, NodeVisualState> = {};
  for (const reach of reaches) {
    const offline = reach.onlineStatus === 'OFFLINE' || reach.onlineStatus === 'UNKNOWN';
    const tier: NodeVisualStatus = offline
      ? 'offline'
      : reach.onlineStatus === 'STALE'
        ? 'watch'
        : 'normal';
    map[reach.reachId] = { tier, offline };
  }

  for (const event of events) {
    const eventTier: NodeVisualStatus =
      event.status === 'RECOVERY_PENDING' ? 'recovery' : 'abnormal';
    for (const reachId of event.scopeReachIds ?? []) {
      const current = map[reachId] ?? { tier: 'normal' as NodeVisualStatus, offline: false };
      const tier: NodeVisualStatus =
        current.tier === 'abnormal' || eventTier === 'abnormal' ? 'abnormal' : 'recovery';
      map[reachId] = {
        ...current,
        tier,
        eventId: current.eventId ?? event.eventId,
        eventTitle: current.eventTitle ?? event.title,
        eventStatus: current.eventStatus ?? event.status,
      };
    }
  }
  return map;
}
