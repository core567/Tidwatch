import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/apiClient';
import { useDemoStore } from '../../demo/demoStore';
import { useOverviewData } from '../overview/OverviewV2Page';
import { toQueueEvent } from './assessmentAdapter';
import { EventQueue } from './EventQueue';
import { Icon } from '../../components/ui/Icon';
import { PanelState } from '../../components/ui/PanelState';
import type { ActiveEvent } from '@/types/contract';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/assessment.css';

const FILTERS = [
  { value: 'ACTIVE', label: '活动事件' },
  { value: '', label: '全部' },
  { value: 'RECOVERED', label: '已恢复' },
  { value: 'UNRESOLVED', label: '无法判定' },
];

const STATUS_ORDER: Record<string, number> = {
  OPEN: 0, INVESTIGATING: 1, MONITORING: 2, ESCALATED: 3, NARROWED: 4,
  RECOVERY_PENDING: 5, UNRESOLVED: 6, RECOVERED: 7,
};

const PAGE_SIZE = 12;

/**
 * F5 事件中心：新版 EventQueue 视觉 + 原 EventsPage 完整筛选/分页/排序/搜索。
 * 数据全部来自真实 api.events；演示模式在本阶段不提供入口（不写模拟事件）。
 */
export default function AssessmentV2Page() {
  const navigate = useNavigate();
  const demoEnabled = useDemoStore((s) => s.enabled);
  const real = useOverviewData(); // stations 复用
  const [status, setStatus] = useState('ACTIVE');
  const [priority, setPriority] = useState('');
  const [reachId, setReachId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [status, priority, reachId, debounced]);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(keyword), 350);
    return () => window.clearTimeout(id);
  }, [keyword]);

  const eventsQ = useQuery({
    queryKey: ['events', status, priority, reachId, debounced, page],
    queryFn: () =>
      api.events({
        status: status || undefined,
        priority: priority || undefined,
        reachId: reachId || undefined,
        q: debounced || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    refetchInterval: 8000,
  });

  const evidenceCountQ = useQuery({
    queryKey: ['evidence-counts'],
    queryFn: async () => {
      const list = (eventsQ.data?.items ?? []) as ActiveEvent[];
      const entries = await Promise.all(
        list.map(async (e) => {
          try {
            const res = await api.evidence(e.eventId);
            const arr = Array.isArray(res) ? res : (res as { items?: unknown[] }).items ?? [];
            return [e.eventId, arr.length] as const;
          } catch {
            return [e.eventId, 0] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    enabled: (eventsQ.data?.items?.length ?? 0) > 0,
    refetchInterval: 30000,
  });

  const items = useMemo(() => {
    const list = (eventsQ.data?.items ?? []) as ActiveEvent[];
    return list
      .slice()
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
      .map((e) => {
        const q = toQueueEvent(e);
        // 队列卡片证据数与工作台口径一致（同 /events/:id/evidence 接口）
        q.evidence = new Array(evidenceCountQ.data?.[e.eventId] ?? 0).fill(null);
        return q;
      });
  }, [eventsQ.data, evidenceCountQ.data]);

  const total = eventsQ.data?.total ?? 0;
  const filterLabel = FILTERS.find((f) => f.value === status)?.label ?? '';
  const isDefault = status === 'ACTIVE' && !priority && !reachId && !debounced;

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
              <span>事件中心 · 实时研判链路</span>
            </div>
            <h1 className="v2-page-title">
              异常事件中心
              <em>EVENT CENTER</em>
            </h1>
            <p className="v2-page-situation">
              事件列表 · {filterLabel || '全部'}（{total}）· 状态与处置由研判规则自动流转
            </p>
          </div>
          <div className="v2-readouts">
            <div className="v2-readout">
              <span className="v2-readout__label">EVENTS</span>
              <div className="v2-readout__value">{String(total).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub">当前筛选结果</div>
            </div>
          </div>
        </div>

        <div className="v2-filter-bar">
          <div className="v2-filter-chips">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`v2-filter-chip ${status === f.value ? 'v2-is-active' : ''}`.trim()}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
          </div>
          <div className="v2-filter-controls">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="v2-select" aria-label="优先级筛选">
            <option value="">全部优先级</option>
            <option value="HIGH">高</option>
            <option value="NORMAL">普通</option>
            <option value="LOW">低</option>
          </select>
          <select value={reachId} onChange={(e) => setReachId(e.target.value)} className="v2-select" aria-label="断面筛选">
            <option value="">全部断面</option>
            {real.data?.stations.map((s) => (
              <option key={s.id} value={s.id === 'A' ? 'reach-a' : s.id === 'B' ? 'reach-b' : 'reach-c'}>
                {s.name.replace(' 断面', '')}
              </option>
            ))}
          </select>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索事件编号 / 标题 / 关键词"
            className="v2-input"
            aria-label="搜索事件"
          />
          {!isDefault && (
            <button
              type="button"
              className="v2-filter-chip"
              onClick={() => { setStatus('ACTIVE'); setPriority(''); setReachId(''); setKeyword(''); }}
            >
              重置
            </button>
          )}
          </div>
        </div>

        <EventQueue
          events={items}
          total={total}
          stations={real.data?.stations ?? []}
          onSelect={(id) => navigate(`/events/${encodeURIComponent(id)}/workbench`)}
        />

        <div className="v2-pager" hidden={Math.ceil(total / PAGE_SIZE) <= 1}>
          <button type="button" className="v2-btn v2-btn--ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <Icon name="chevron-right" size={12} style={{ transform: 'rotate(180deg)' }} />上一页
          </button>
          <span className="v2-mono">第 {page} 页 · 共 {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页</span>
          <button type="button" className="v2-btn v2-btn--ghost" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>
            下一页<Icon name="chevron-right" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
