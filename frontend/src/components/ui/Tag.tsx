import type { ReactNode } from 'react';

export type TagTone = 'default' | 'ok' | 'watch' | 'danger' | 'muted' | 'outline';

export function Tag({
  tone = 'default',
  children,
  title,
}: {
  tone?: TagTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`tw-tag tw-tag-${tone}`} title={title}>
      {children}
    </span>
  );
}

export type DataState = 'LIVE' | 'STALE' | 'NO_DATA' | 'SIMULATED' | 'OFFLINE';

const DATA_STATE: Record<DataState, { text: string; tone: TagTone }> = {
  LIVE: { text: '官方实时', tone: 'ok' },
  STALE: { text: '数据过期', tone: 'watch' },
  NO_DATA: { text: '暂无数据', tone: 'muted' },
  SIMULATED: { text: '模拟数据', tone: 'watch' },
  OFFLINE: { text: '站点离线', tone: 'muted' },
};

export function DataStateBadge({ state }: { state: DataState }) {
  const v = DATA_STATE[state] ?? DATA_STATE.NO_DATA;
  return <Tag tone={v.tone}>{v.text}</Tag>;
}
