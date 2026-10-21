// utils/util.ts - 通用展示工具

/** ISO 8601 → 'YYYY-MM-DD HH:mm'（本地时区显示，演示用） */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** 相对时间，如“3 分钟前 / 2 小时前” */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.max(0, Math.round((now - t) / 1000));
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  OFFICIAL_PUBLIC: '官方公开',
  SIMULATED: '模拟数据',
  EXTERNAL: '外部数据',
  RULE_OUTPUT: '规则输出',
  MODEL_OUTPUT: '模型输出',
  MANUAL: '人工记录',
};

export function sourceLabel(s: SourceType): string {
  return SOURCE_LABELS[s] ?? s;
}

export function isSimulated(s: SourceType | undefined | null): boolean {
  return s === 'SIMULATED';
}
