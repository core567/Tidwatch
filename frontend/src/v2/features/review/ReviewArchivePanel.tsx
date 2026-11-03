import { EVENT_STATUS, reachName } from '@/components/EventBits';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import type { ActiveEvent } from '@/types/contract';
import type { ArchiveStats } from './useReviewArchive';
import { ARCHIVE_PAGE_SIZE, PRIORITY_FILTERS, formatDuration, priorityMeta } from './useReviewArchive';

interface Props {
  events: ActiveEvent[];
  total: number;
  stats: ArchiveStats;
  selectedId?: string;
  query: string;
  onQuery: (value: string) => void;
  priority: string;
  onPriority: (value: string) => void;
  onSelect: (id: string) => void;
  page: number;
  onPage: (page: number) => void;
  loading: boolean;
  fetchedTotal: number;
}

export function ReviewArchivePanel({
  events,
  total,
  stats,
  selectedId,
  query,
  onQuery,
  priority,
  onPriority,
  onSelect,
  page,
  onPage,
  loading,
  fetchedTotal,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  const maxBar = Math.max(1, ...stats.buckets.map((b) => b.count));
  const weeklySum = stats.buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <Panel
      code="01"
      title="事件档案"
      en="EVENT ARCHIVE"
      className="v2-archive"
      bodyClassName="v2-archive__body"
      actions={<Badge>{String(total).padStart(2, '0')} ARCHIVED</Badge>}
      footer={
        <>
          <span className="v2-archive__foot">共 {total} 起事件</span>
          <span className="v2-archive__foot v2-mono">LIVE · /events</span>
        </>
      }
    >
      <div className="v2-archive-search">
        <Icon name="search" size={13} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="搜索编号、标题或断面"
          aria-label="搜索历史事件"
        />
        {query && (
          <button type="button" onClick={() => onQuery('')} aria-label="清空搜索">
            <Icon name="close" size={11} />
          </button>
        )}
      </div>

      <div className="v2-archive-risk">
        {PRIORITY_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`v2-risk-chip ${priority === option.value ? 'v2-is-active' : ''}`.trim()}
            onClick={() => onPriority(option.value)}
            aria-pressed={priority === option.value}
          >
            {option.value && <i className={`v2-risk-chip__dot v2-risk-chip__dot--${priorityMeta(option.value as ActiveEvent['priority']).tone}`} />}
            {option.label}
          </button>
        ))}
      </div>

      <div className="v2-archive-stats">
        <div>
          <span>近 30 天</span>
          <b className="v2-mono">{String(stats.total30d).padStart(2, '0')}</b>
          <em>起</em>
        </div>
        <div>
          <span>高风险</span>
          <b className="v2-mono">{String(stats.highRisk).padStart(2, '0')}</b>
          <em>起</em>
        </div>
        <div>
          <span>平均闭环</span>
          <b className="v2-mono">{formatDuration(stats.avgCloseMs)}</b>
        </div>
      </div>

      <div className="v2-archive-bars">
        <div className="v2-archive-bars__head">
          <span>近 30 日事件量</span>
          <span className="v2-mono">累计 {weeklySum}</span>
        </div>
        <div className="v2-archive-bars__chart">
          {stats.buckets.map((bucket) => (
            <span className="v2-archive-bar" key={bucket.label} title={`${bucket.label} 起 · ${bucket.count} 起`}>
              <i
                style={{ height: `${Math.max(3, Math.round((bucket.count / maxBar) * 34))}px` }}
                className={bucket.count >= 2 ? 'is-high' : ''}
              />
              <em className="v2-mono">{bucket.label.slice(3)}</em>
            </span>
          ))}
        </div>
      </div>

      <div className="v2-archive-list">
        {loading && events.length === 0 && (
          <div className="v2-archive-empty">事件档案加载中…</div>
        )}
        {events.map((event) => {
          const risk = priorityMeta(event.priority);
          const status = EVENT_STATUS[event.status]?.text ?? event.status;
          return (
            <button
              key={event.eventId}
              type="button"
              className={`v2-archive-item ${selectedId === event.eventId ? 'is-active' : ''}`.trim()}
              onClick={() => onSelect(event.eventId)}
              aria-pressed={selectedId === event.eventId}
            >
              <span className="v2-archive-item__date">
                <b className="v2-mono">{event.firstSeenAt.slice(5, 10)}</b>
                <em className="v2-mono">{event.firstSeenAt.slice(11, 16)}</em>
              </span>
              <span className="v2-archive-item__main">
                <span className="v2-archive-item__title" title={event.title}>{event.title}</span>
                <span className="v2-archive-item__meta">
                  {event.scopeReachIds.map(reachName).join(' · ') || '—'} · {event.eventId}
                </span>
              </span>
              <span className="v2-archive-item__side">
                <span className={`v2-archive-item__risk v2-archive-item__risk--${risk.tone}`}>{risk.code}</span>
                <span className="v2-archive-item__status">{status}</span>
              </span>
            </button>
          );
        })}
        {!loading && events.length === 0 && (
          <div className="v2-archive-empty">
            <Icon name="search" size={17} />
            没有匹配的历史事件
            <span>尝试清空搜索或切换风险筛选</span>
          </div>
        )}
        {!loading && events.length > 0 && events.length < 5 && (
          <div className="v2-archive-hint">
            <Icon name="layers" size={14} />
            <span>已显示全部 {events.length} 起事件</span>
            <em>事件由规则识别后自动归档；完成现场复核与恢复评估后可在此复盘。</em>
          </div>
        )}
      </div>

      <div className="v2-archive-pager">
        <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        <span className="v2-mono">{page} / {pageCount}</span>
        <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>下一页</button>
      </div>

      {fetchedTotal > 200 && (
        <p className="v2-archive__limit">统计基于最近 200 起事件</p>
      )}
    </Panel>
  );
}
