import { useMemo, useState } from 'react';
import { reachName } from '@/components/EventBits';
import type { ReviewBlindSpot, TimelineItem } from '@/types/contract';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import {
  blindSpotTime,
  buildBlindSpotSummary,
  groupStatusText,
} from './blindspotModel';

const PAGE_STEP = 5;

export function BlindSpotPanel({
  records,
  timeline,
}: {
  records: ReviewBlindSpot[];
  timeline: TimelineItem[];
}) {
  const summary = useMemo(() => buildBlindSpotSummary(records, timeline), [records, timeline]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState<Record<string, number>>({});
  const allExpanded = summary.groups.length > 0 && summary.groups.every((g) => expanded.has(g.key));

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setVisible((prev) => {
      if (expanded.has(key)) return { ...prev, [key]: PAGE_STEP };
      return prev;
    });
  }

  function expandAll() {
    setExpanded(new Set(summary.groups.map((g) => g.key)));
  }

  function collapseAll() {
    setExpanded(new Set());
    setVisible({});
  }

  function loadMore(key: string) {
    setVisible((prev) => ({ ...prev, [key]: (prev[key] ?? PAGE_STEP) + PAGE_STEP }));
  }

  if (records.length === 0) {
    return (
      <section className="v2-review-subblock v2-blind">
        <header className="v2-blind__head">
          <h4>监测盲区</h4>
          <span>BLIND SPOTS</span>
          <Badge>0</Badge>
        </header>
        <p className="v2-report-empty">无盲区记录</p>
      </section>
    );
  }

  return (
    <section className="v2-review-subblock v2-blind">
      <header className="v2-blind__head">
        <h4>监测盲区</h4>
        <span>BLIND SPOTS</span>
        <Badge>{summary.total}</Badge>
        <div className="v2-blind__actions">
          <button type="button" onClick={expandAll} disabled={allExpanded} title="展开所有断面分组">
            全部展开
          </button>
          <button type="button" onClick={collapseAll} disabled={expanded.size === 0} title="收起所有断面分组">
            全部收起
          </button>
        </div>
      </header>

      <div className="v2-blind__summary">
        <div className="v2-blind-stat">
          <b>{summary.total}</b>
          <span>记录总数</span>
        </div>
        <div className={`v2-blind-stat ${summary.unresolved > 0 ? 'is-danger' : ''}`}>
          <b>{summary.unresolved}</b>
          <span>未解除</span>
        </div>
        <div className="v2-blind-stat is-ok">
          <b>{summary.resolved}</b>
          <span>已解除</span>
        </div>
      </div>

      <div className="v2-blind__groups">
        {summary.groups.map((group) => {
          const isOpen = expanded.has(group.key);
          const limit = visible[group.key] ?? PAGE_STEP;
          const ordered = group.records.map((record, index) => ({ record, index })).reverse();
          const shown = ordered.slice(0, limit);
          const remaining = Math.max(0, group.total - shown.length);
          return (
            <div className={`v2-blind-group ${isOpen ? 'is-open' : ''}`.trim()} key={group.key}>
              <button
                type="button"
                className="v2-blind-group__head"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={isOpen}
                aria-controls={`blind-${group.key}`}
              >
                <span className="v2-blind-group__reach">{reachName(group.reachId)}</span>
                <span className="v2-blind-group__reason" title={group.reason}>{group.reason}</span>
                <span className="v2-blind-group__count v2-mono">{group.total} 条</span>
                <span className="v2-blind-group__times v2-mono">
                  {group.firstOpenedAt
                    ? `首次 ${blindSpotTime(group.firstOpenedAt)} · 最近 ${blindSpotTime(group.lastOpenedAt)}`
                    : '时间线无开启记录'}
                </span>
                <Badge tone={group.unresolved > 0 ? 'high' : 'live'}>{groupStatusText(group)}</Badge>
                <Icon
                  name="chevron-right"
                  size={11}
                  className={`v2-blind-group__chevron ${isOpen ? 'v2-is-open' : ''}`.trim()}
                />
              </button>

              {isOpen && (
                <div className="v2-blind-group__body" id={`blind-${group.key}`}>
                  <div className="v2-blind-group__meta">
                    <span>已解除 {group.resolved}</span>
                    <span>未解除 {group.unresolved}</span>
                    {group.lastResolvedAt && <span>最近解除 {blindSpotTime(group.lastResolvedAt)}</span>}
                    <span className="v2-mono">按接口顺序倒序 · 只读</span>
                  </div>
                  <ul className="v2-blind-records">
                    {shown.map(({ record, index }) => (
                      <li key={`${group.key}-${index}`}>
                        <span className="v2-blind-record__no v2-mono">
                          #{String(index + 1).padStart(3, '0')}
                        </span>
                        <Badge tone={record.resolved ? 'default' : 'high'}>
                          {record.resolved ? '已解除' : '未消除'}
                        </Badge>
                        <span className="v2-blind-record__impact" title={`${record.reason}${record.impact ? ` · ${record.impact}` : ''}`}>
                          {record.impact ?? record.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {remaining > 0 && (
                    <button type="button" className="v2-blind__more" onClick={() => loadMore(group.key)}>
                      加载更多（剩余 {remaining} 条）
                    </button>
                  )}
                  {remaining === 0 && (
                    <span className="v2-blind__all-loaded v2-mono">已显示全部 {group.total} 条原始记录</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="v2-blind__note">
        统计与记录来自复盘接口返回的盲区快照；首次/最近时间取自统一时间线的盲区开启、解除审计事件。历史记录只读，不删除、不覆盖。
      </p>
    </section>
  );
}
