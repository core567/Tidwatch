import type { EventStatus } from '@/types/contract';

export const EVENT_STATUS: Record<EventStatus, { text: string; cls: string }> = {
  OPEN: { text: '待初查', cls: 'badge-watch' },
  INVESTIGATING: { text: '研判中', cls: 'badge-watch' },
  MONITORING: { text: '持续观察', cls: 'badge-ok' },
  ESCALATED: { text: '已升级', cls: 'badge-danger' },
  NARROWED: { text: '范围收窄', cls: 'badge-ok' },
  RECOVERY_PENDING: { text: '待确认恢复', cls: 'badge-watch' },
  RECOVERED: { text: '已恢复', cls: 'badge-offline' },
  UNRESOLVED: { text: '无法判定', cls: 'badge-offline' },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const v = EVENT_STATUS[status] ?? { text: status, cls: 'badge-offline' };
  return <span className={`badge ${v.cls}`}>{v.text}</span>;
}

export const REACH_NAME: Record<string, string> = {
  'reach-a': '上游 A',
  'reach-b': '中游 B',
  'reach-c': '下游 C',
};

export function reachName(id: string): string {
  return REACH_NAME[id] ?? id;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
