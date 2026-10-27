// 事件 8 态展示文案/色调（只读展示，状态迁移由后端 FSM 执行）
import type { StatusView } from './taskLabels';

const EVENT_STATUS: Record<string, StatusView> = {
  OPEN: { text: '待初查', tone: 'watch' },
  INVESTIGATING: { text: '研判中', tone: 'watch' },
  MONITORING: { text: '持续观察', tone: 'watch' },
  ESCALATED: { text: '升级关注', tone: 'danger' },
  NARROWED: { text: '范围收窄', tone: 'ok' },
  RECOVERY_PENDING: { text: '待确认恢复', tone: 'watch' },
  RECOVERED: { text: '已恢复', tone: 'ok' },
  UNRESOLVED: { text: '无法判定', tone: 'offline' },
};

export function eventStatusView(status: string): StatusView {
  return EVENT_STATUS[status] ?? { text: status, tone: 'offline' };
}

/** 非终态即“活动中”（与 PC/后端口径一致：RECOVERED/UNRESOLVED 为终态） */
export function isEventActive(status: string): boolean {
  return status !== 'RECOVERED' && status !== 'UNRESOLVED';
}

export const EVENT_TRIGGER_METRIC: Record<string, string> = {
  waterLevel: '水位',
  turbidity: '浊度',
  flowLevel: '水流等级',
};

export function triggerMetricText(metric: string | undefined | null): string {
  return metric ? EVENT_TRIGGER_METRIC[metric] ?? metric : '—';
}
