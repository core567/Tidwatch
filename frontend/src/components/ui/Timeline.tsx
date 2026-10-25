import type { ReactNode } from 'react';

export type TimelineTone = 'default' | 'ok' | 'watch' | 'danger' | 'muted';

export interface TimelineItem {
  id: string;
  at: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: TimelineTone;
}

export function formatTimelineTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="tw-timeline">
      {items.map((item) => (
        <li key={item.id} className="tw-timeline-item" data-tone={item.tone ?? 'default'}>
          <div className="tw-timeline-time">{formatTimelineTime(item.at)}</div>
          <div className="tw-timeline-title">{item.title}</div>
          {item.description ? <div className="tw-timeline-desc">{item.description}</div> : null}
          {item.meta ? <div className="tw-timeline-meta">{item.meta}</div> : null}
        </li>
      ))}
    </ol>
  );
}
