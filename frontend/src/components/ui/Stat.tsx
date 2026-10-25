import type { ReactNode } from 'react';

export type StatTone = 'default' | 'ok' | 'watch' | 'danger' | 'muted';

export interface StatProps {
  label: ReactNode;
  value: number | string | null | undefined;
  unit?: string;
  hint?: ReactNode;
  tone?: StatTone;
  /** 数值为空时的占位文案 */
  emptyText?: string;
  /** 小数位（仅 number 生效） */
  digits?: number;
}

export default function Stat({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  emptyText = '暂无数据',
  digits,
}: StatProps) {
  const empty = value === null || value === undefined || value === '';
  const text = empty
    ? emptyText
    : typeof value === 'number' && digits !== undefined
      ? value.toFixed(digits)
      : String(value);
  const actualTone: StatTone = empty ? 'muted' : tone;
  return (
    <div className={`tw-stat tw-stat-tone-${actualTone}`}>
      <div className="tw-stat-label">{label}</div>
      <div className="tw-stat-value">
        {text}
        {!empty && unit && <small>{unit}</small>}
      </div>
      {hint && <div className="tw-stat-hint">{hint}</div>}
    </div>
  );
}
