import type { ReactNode } from 'react';

export type BadgeTone = 'default' | 'demo' | 'live' | 'high' | 'mid' | 'good' | 'station';

const toneClass: Record<BadgeTone, string> = {
  default: '',
  demo: 'badge--demo',
  live: 'badge--live',
  high: 'badge--risk-high',
  mid: 'badge--risk-mid',
  good: 'badge--good',
  station: 'badge--station',
};

export function Badge({
  children,
  tone = 'default',
  dot,
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: 'good' | 'warn' | 'danger' | 'idle';
  className?: string;
}) {
  return (
    <span className={`v2-badge ${toneClass[tone]} ${className}`.trim()}>
      {dot && <span className={`v2-status-dot v2-status-dot--${dot}`} />}
      {children}
    </span>
  );
}
