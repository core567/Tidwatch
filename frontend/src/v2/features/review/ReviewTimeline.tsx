import { useMemo, useState } from 'react';
import type { TimelineItem } from '@/types/contract';
import { Badge } from '../../components/ui/Badge';
import { formatTime } from '@/components/EventBits';
import { ACTION_CN, BIZ_TYPE_CN } from './reviewModel';
import { timeMs } from './useEventDossier';

const FILTERS = [
  { value: 'KEY', label: '关键节点' },
  { value: 'ALL', label: '全部' },
  { value: 'EVENT', label: '事件' },
  { value: 'TASK', label: '任务' },
  { value: 'SUBMISSION', label: '现场提交' },
  { value: 'REVIEW', label: '复核' },
  { value: 'EVIDENCE', label: '证据' },
  { value: 'BLINDSPOT', label: '盲区' },
] as const;

type FilterValue = typeof FILTERS[number]['value'];

function toneOf(bizType: string): 'event' | 'task' | 'field' | 'evidence' | 'blindspot' | 'muted' {
  if (bizType === 'EVENT') return 'event';
  if (bizType === 'TASK') return 'task';
  if (bizType === 'SUBMISSION' || bizType === 'REVIEW') return 'field';
  if (bizType === 'EVIDENCE') return 'evidence';
  if (bizType === 'BLINDSPOT') return 'blindspot';
  return 'muted';
}

/**
 * 统一业务时间线（真实 business_events）。
 * 默认只展示关键业务节点；盲区扫描与全部原始记录可通过筛选查看。
 */
export function ReviewTimeline({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<FilterValue>('KEY');

  const prepared = useMemo(() => {
    const sorted = [...items].sort((a, b) => timeMs(a.occurredAt) - timeMs(b.occurredAt));
    const seen = new Set<string>();
    const deduped = sorted.filter((item) => {
      const key = [
        item.actionType,
        item.taskRef ?? '',
        item.submissionRef ?? '',
        item.reviewRef ?? '',
        item.description ?? '',
        item.toStatus ?? '',
        item.occurredAt.slice(0, 16),
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (filter === 'ALL') return deduped;
    if (filter === 'KEY') return deduped.filter((item) => item.bizType !== 'BLINDSPOT');
    return deduped.filter((item) => item.bizType === filter);
  }, [items, filter]);

  return (
    <div className="v2-review-timeline">
      <div className="v2-review-timeline__filters">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`v2-review-timeline__chip ${filter === f.value ? 'is-active' : ''}`.trim()}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
          >
            {f.label}
          </button>
        ))}
        <span className="v2-review-timeline__count v2-mono">
          {prepared.length} / {items.length} 条
        </span>
      </div>

      <div className="v2-review-timeline__list">
        {prepared.length === 0 && <p className="v2-report-empty">当前筛选下暂无记录</p>}
        {prepared.map((item, index) => {
          const tone = toneOf(item.bizType);
          return (
            <div className={`v2-tl-item v2-tl-item--${tone}`} key={`${item.actionType}-${item.occurredAt}-${index}`}>
              <span className="v2-tl-item__dot" />
              <div className="v2-tl-item__main">
                <div className="v2-tl-item__meta">
                  <span className="v2-mono">{formatTime(item.occurredAt)}</span>
                  <span>{item.actor}{item.actorRole ? ` / ${item.actorRole}` : ''}</span>
                  <Badge tone={tone === 'blindspot' ? 'high' : tone === 'evidence' ? 'live' : 'default'}>
                    {BIZ_TYPE_CN[item.bizType] ?? item.bizType}
                  </Badge>
                  {item.fromStatus && item.toStatus && (
                    <span className="v2-mono">{item.fromStatus} → {item.toStatus}</span>
                  )}
                </div>
                <b>{ACTION_CN[item.actionType] ?? item.actionType}</b>
                {item.description && <p>{item.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
