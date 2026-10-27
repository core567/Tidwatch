// utils/freshness.ts - 数据新鲜度（纯展示启发式，不参与任何业务判定）
// 链路在线状态（Reach.onlineStatus）与数据年龄是两件事，必须分开表达：
// onlineStatus 反映 MQTT 链路是否存活；本模块只描述 lastSeenAt 距今多久。

export type FreshnessLevel = 'fresh' | 'stale' | 'old';

export interface Freshness {
  level: FreshnessLevel;
  minutes: number;
  /** 相对时间文案：刚刚 / N 分钟前 / N 小时前 / N 天前 */
  text: string;
}

const HOUR = 60;
const DAY = 24 * 60;

export function ageMinutes(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 60000));
}

/**
 * 仅用于展示配色的阈值：
 * fresh <1h（青绿）；stale 1–24h（橙）；old ≥24h（灰）。
 * 不是水质/事件判定规则。
 */
export function freshness(iso: string | null | undefined, now: number = Date.now()): Freshness | null {
  const minutes = ageMinutes(iso, now);
  if (minutes === null) return null;
  let level: FreshnessLevel;
  if (minutes < HOUR) level = 'fresh';
  else if (minutes < DAY) level = 'stale';
  else level = 'old';
  return { level, minutes, text: relativeText(minutes) };
}

export function relativeText(minutes: number): string {
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}
