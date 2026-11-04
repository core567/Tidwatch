import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/apiClient';
import { useDemoStore } from '../../demo/demoStore';
import { useOverviewData } from '../overview/OverviewV2Page';
import { toQueueEvent } from './assessmentAdapter';
import { EventQueue } from './EventQueue';
import { CaseWorkbenchV2 } from './CaseWorkbenchV2';
import { EVENT_STATUS_GROUP } from './meta';
import { Segmented } from '../../components/ui/Segmented';
import { Icon } from '../../components/ui/Icon';
import { PanelState } from '../../components/ui/PanelState';
import { reachName } from '@/components/EventBits';
import type { ActiveEvent } from '@/types/contract';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/assessment.css';

type StatusFilter = 'all' | 'active' | 'review' | 'closed';
type RiskFilter = 'all' | 'high' | 'medium' | 'low';

const STATUS_OPTIONS = [
  { value: 'all' as const, label: '全部' },
  { value: 'active' as const, label: '进行中' },
  { value: 'review' as const, label: '待复核' },
  { value: 'closed' as const, label: '已闭环' },
];

const RISK_OPTIONS = [
  { value: 'all' as const, label: '全部风险' },
  { value: 'high' as const, label: '高风险' },
  { value: 'medium' as const, label: '中风险' },
  { value: 'low' as const, label: '低风险' },
];

function groupMatches(status: string, filter: StatusFilter): boolean {
  const group = EVENT_STATUS_GROUP[status];
  if (filter === 'all') return true;
  if (filter === 'active') return group === '待研判' || group === '研判中' || group === '处置中';
  if (filter === 'review') return group === '待复核';
  return group === '已闭环';
}

function riskMatches(priority: string, filter: RiskFilter): boolean {
  if (filter === 'all') return true;
  return (priority === 'HIGH' ? 'high' : priority === 'LOW' ? 'low' : 'medium') === filter;
}

/**
 * F7.2 异常研判：恢复 TidewatchWeb 原版左队列 + 右研判工作台，
 * 数据来自真实 events / evidence / hypotheses / timeline / recommendations / tasks。
 */
export default function AssessmentV2Page() {
  const navigate = useNavigate();
  const demoEnabled = useDemoStore((s) => s.enabled);
  const real = useOverviewData();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const eventsQ = useQuery({
    queryKey: ['events', 'assessment-dashboard'],
    queryFn: () => api.events({ page: 1, pageSize: 200 }),
    refetchInterval: 8000,
  });
  const allEvents = (eventsQ.data?.items ?? []) as ActiveEvent[];

  const evidenceCountQ = useQuery({
    queryKey: ['evidence-counts', allEvents.map((event) => event.eventId).join(',')],
    queryFn: async () => {
      const entries = await Promise.all(allEvents.map(async (event) => {
        try {
          const result = await api.evidence(event.eventId);
          const list = Array.isArray(result) ? result : (result as { items?: unknown[] }).items ?? [];
          return [event.eventId, list.length] as const;
        } catch {
          return [event.eventId, 0] as const;
        }
      }));
      return Object.fromEntries(entries) as Record<string, number>;
    },
    enabled: allEvents.length > 0,
  });

  const normalized = keyword.trim().toLowerCase();
  const filtered = useMemo(() => allEvents.filter((event) => {
    const text = `${event.eventId} ${event.title} ${event.scopeReachIds.map(reachName).join(' ')}`.toLowerCase();
    return groupMatches(event.status, statusFilter)
      && riskMatches(event.priority, riskFilter)
      && (!normalized || text.includes(normalized));
  }), [allEvents, statusFilter, riskFilter, normalized]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !filtered.some((event) => event.eventId === selectedId)) {
      setSelectedId(filtered[0].eventId);
    }
  }, [filtered, selectedId]);

  const queueEvents = useMemo(
    () => filtered.map((event) => {
      const item = toQueueEvent(event);
      item.evidence = new Array(evidenceCountQ.data?.[event.eventId] ?? 0).fill(null);
      return item;
    }),
    [filtered, evidenceCountQ.data],
  );

  const highCount = allEvents.filter((event) => event.priority === 'HIGH').length;
  const activeCount = allEvents.filter((event) => {
    const group = EVENT_STATUS_GROUP[event.status];
    return group === '待研判' || group === '研判中' || group === '处置中';
  }).length;
  const reviewCount = allEvents.filter((event) => EVENT_STATUS_GROUP[event.status] === '待复核').length;
  const closedCount = allEvents.filter((event) => EVENT_STATUS_GROUP[event.status] === '已闭环').length;
  const lead = allEvents.find((event) => event.priority === 'HIGH' && EVENT_STATUS_GROUP[event.status] !== '已闭环');

  const loading = eventsQ.isLoading && allEvents.length === 0;
  const error = eventsQ.error as Error | null;

  if (demoEnabled) {
    return (
      <div className="v2-scope">
        <div className="v2-page">
          <div className="v2-panel v2-state-page">
            <PanelState variant="empty" title="演示模式暂不适用于事件中心" desc="事件中心仅展示真实监测事件。" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-scope">
      <div className="v2-page v2-assessment-page">
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>ASSESSMENT · CASE WORKBENCH</span>
              <button type="button" className="v2-review-sync" onClick={() => void eventsQ.refetch()} disabled={eventsQ.isFetching}>
                <Icon name="refresh" size={11} className={eventsQ.isFetching ? 'v2-is-spinning' : undefined} />
                {eventsQ.isFetching ? '同步中' : '刷新'}
              </button>
            </div>
            <h1 className="v2-page-title">异常研判与处置<em>ASSESSMENT</em></h1>
            <p className="v2-page-situation">
              {lead ? <><b className="v2-hot">{lead.title}</b>正在研判；</> : null}
              {reviewCount} 起现场反馈等待复核，{closedCount} 起事件已闭环。选择左侧事件查看证据链、研判假设与处置建议。
            </p>
          </div>
          <div className="v2-readouts">
            <div className="v2-readout">
              <span className="v2-readout__label">HIGH RISK</span>
              <div className="v2-readout__value">{String(highCount).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub"><span className="v2-status-dot v2-status-dot--danger" />需优先处置</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">IN PROGRESS</span>
              <div className="v2-readout__value">{String(activeCount).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub">研判 · 处置 · 流转</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">TO REVIEW</span>
              <div className="v2-readout__value">{String(reviewCount).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub">等待审核结论</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">CLOSED</span>
              <div className="v2-readout__value">{String(closedCount).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub">已闭环</div>
            </div>
          </div>
        </div>

        <div className="v2-panel v2-workbench-bar" role="group" aria-label="事件筛选">
          <div className="v2-workbench-bar__group">
            <span className="v2-workbench-bar__label">状态</span>
            <Segmented ariaLabel="按状态筛选事件" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
          </div>
          <div className="v2-workbench-bar__group">
            <span className="v2-workbench-bar__label">风险</span>
            <div className="v2-risk-filter">
              {RISK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`v2-risk-chip ${riskFilter === option.value ? 'v2-is-active' : ''}`.trim()}
                  onClick={() => setRiskFilter(option.value)}
                  aria-pressed={riskFilter === option.value}
                >
                  {option.value !== 'all' && <i className={`v2-risk-chip__dot v2-risk-chip__dot--${option.value}`} />}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <input className="v2-input" placeholder="搜索编号 / 标题 / 断面" value={keyword} onChange={(e) => setKeyword(e.target.value)} aria-label="搜索事件" />
          <span className="v2-workbench-bar__count">显示 <b className="v2-mono">{filtered.length}</b> / {allEvents.length} 起</span>
        </div>

        {loading ? (
          <div className="v2-panel v2-state-page"><PanelState variant="loading" title="事件加载中…" /></div>
        ) : error ? (
          <div className="v2-panel v2-state-page">
            <PanelState variant="error" title="事件加载失败" desc={error.message}
              action={<button type="button" className="v2-btn v2-btn--primary" onClick={() => void eventsQ.refetch()}>重新加载</button>} />
          </div>
        ) : (
          <div className="v2-grid v2-assessment-grid">
            <div className="v2-col-4 v2-queue-col">
              <EventQueue
                events={queueEvents}
                total={allEvents.length}
                stations={real.data?.stations ?? []}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <div className="v2-col-8 v2-case-col">
              <CaseWorkbenchV2
                eventId={selectedId ?? ''}
                onOpenFull={selectedId ? () => navigate(`/events/${encodeURIComponent(selectedId)}/workbench`) : undefined}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
