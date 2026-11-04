import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/services/apiClient';
import { buildCaseEvent } from './assessmentAdapter';
import {
  CASE_STAGES, EVIDENCE_ICON, EVENT_STATUS_GROUP, RISK_CODE, RISK_LABEL,
  STAGE_BY_STATUS, STATUS_KEY,
} from './meta';
import { EvidenceDrawer } from './EvidenceDrawer';
import { DispatchTaskDrawer } from './DispatchTaskDrawer';
import { Badge } from '../../components/ui/Badge';
import { Icon, type IconName } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { PanelState } from '../../components/ui/PanelState';
import { Sparkline } from '../../components/ui/Sparkline';
import { Segmented } from '../../components/ui/Segmented';
import { EVENT_ACTION_LABEL } from '@/lib/eventActions';
import { reachName } from '@/components/EventBits';
import { simMetricName, simMetricUnitByKey } from '@/lib/metrics';
import { summarizeObservationSource } from '@/lib/observationSource';
import type {
  EventAction, Evidence, Hypothesis, Recommendation, TimelineItem,
} from '@/types/contract';
import type { TimelineStep } from './assessmentTypes';

const TASK_STATUS_CN: Record<string, string> = {
  DRAFT: '草稿', PENDING: '待派发', ACCEPTED: '已接单', IN_PROGRESS: '执行中',
  SUBMITTED: '待复核', APPROVED: '已完成', CANCELLED: '已取消',
};

const BIZ_ICON: Record<string, IconName> = {
  EVENT: 'assessment', TASK: 'inspection', SUBMISSION: 'send', REVIEW: 'review',
  ASSESSMENT: 'analysis', EVIDENCE: 'camera', BLINDSPOT: 'search',
  ATTACHMENT: 'layers', RECOVERY: 'refresh',
};

const TIMELINE_LABEL: Record<string, string> = {
  EVENT: '事件流转', TASK: '任务动态', SUBMISSION: '现场提交', REVIEW: '复核记录',
  ASSESSMENT: '研判评估', EVIDENCE: '证据归档', BLINDSPOT: '盲区扫描',
  ATTACHMENT: '附件上传', RECOVERY: '恢复评估',
};

function shiftIso(iso: string, hours: number): string {
  const normalized = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  return new Date(Date.parse(normalized) + hours * 3600_000).toISOString().slice(0, 19);
}

function TimelineRow({ step }: { step: TimelineStep }) {
  return (
    <li className={`v2-case-timeline__item v2-case-timeline__item--${step.state}`}>
      <span className={`v2-case-timeline__dot v2-case-timeline__dot--${step.bizType ?? 'EVENT'}`}>
        <Icon name={BIZ_ICON[step.bizType ?? ''] ?? 'wave'} size={11} />
      </span>
      <div className="v2-case-timeline__main">
        <div className="v2-case-timeline__meta">
          <span className="v2-case-timeline__btn v2-mono">{TIMELINE_LABEL[step.bizType ?? ''] ?? step.bizType ?? '事件'}</span>
          <span className="v2-mono">{step.time}</span>
          <em>{step.actor}</em>
        </div>
        <b>{step.action}</b>
        {step.note && <p>{step.note}</p>}
      </div>
    </li>
  );
}

/**
 * 原版案例工作台的 V2 复原版：真实事件/证据/假设/时间线/建议/任务/操作。
 * 阅读读数与趋势使用观测序列峰值；假设显示真实证据支持占比。
 */
export function CaseWorkbenchV2({
  eventId, onOpenFull,
}: {
  eventId: string;
  onOpenFull?: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<EventAction | null>(null);
  const [error, setError] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [timelineMode, setTimelineMode] = useState<'key' | 'all'>('key');
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [dispatchRec, setDispatchRec] = useState<Recommendation | null>(null);

  const eventQ = useQuery({ queryKey: ['event', eventId], queryFn: () => api.event(eventId), enabled: !!eventId, refetchInterval: 8000 });
  const evidenceQ = useQuery({ queryKey: ['evidence', eventId], queryFn: () => api.evidence(eventId), enabled: !!eventId, refetchInterval: 15000 });
  const hypQ = useQuery({ queryKey: ['hypotheses', eventId], queryFn: () => api.hypotheses(eventId), enabled: !!eventId, refetchInterval: 15000 });
  const timelineQ = useQuery({ queryKey: ['event-timeline', eventId], queryFn: () => api.eventTimeline(eventId), enabled: !!eventId, refetchInterval: 8000 });
  const recsQ = useQuery({ queryKey: ['event-recs', eventId], queryFn: () => api.eventRecommendations(eventId), enabled: !!eventId, refetchInterval: 30000 });
  const tasksQ = useQuery({ queryKey: ['tasks', 'by-event', eventId], queryFn: () => api.tasks({ eventId }), enabled: !!eventId, refetchInterval: 8000 });

  const detail = eventQ.data;
  const trigger = detail?.trigger;
  const obsQ = useQuery({
    queryKey: ['case-observations', eventId, trigger?.reachId, trigger?.metric, detail?.firstSeenAt, detail?.updatedAt],
    queryFn: () => api.observations(trigger!.reachId, {
      metric: trigger!.metric,
      from: shiftIso(detail!.firstSeenAt, -12),
      to: shiftIso(new Date().toISOString(), 0),
      order: 'asc', page: 1, pageSize: 5000,
    }),
    enabled: !!(trigger && detail),
    refetchInterval: 30000,
  });

  const trend = useMemo(() => {
    const rows = (obsQ.data?.items ?? []).filter((obs) => obs.qualityFlag !== 'INVALID' && obs.qualityFlag !== 'MISSING');
    const source = summarizeObservationSource(rows);
    if (!rows.length) {
      return { peak: null as number | null, last: null as number | null, spark: [] as number[], unit: '', samples: 0, source };
    }
    const values = rows.map((obs) => obs.value);
    const stride = Math.max(1, Math.ceil(rows.length / 30));
    return {
      peak: Math.max(...values),
      last: rows[rows.length - 1].value,
      spark: rows.filter((_, i) => i % stride === 0 || i === rows.length - 1).map((obs) => obs.value),
      unit: rows[0].unit || (trigger ? simMetricUnitByKey(trigger.metric) : ''),
      samples: rows.length,
      source,
    };
  }, [obsQ.data, detail, trigger]);

  const caseEvent = useMemo(() => {
    if (!detail) return null;
    return buildCaseEvent({
      detail,
      evidence: (evidenceQ.data ?? []) as Evidence[],
      hypotheses: (hypQ.data ?? []) as Hypothesis[],
      timeline: (timelineQ.data?.items ?? []) as TimelineItem[],
      suggestions: (recsQ.data?.items ?? []) as Recommendation[],
      tasks: (tasksQ.data?.items ?? []).map((task) => ({
        taskId: task.taskId, title: task.title, status: task.status,
        assignee: task.assignee, createdAt: task.createdAt, reachId: task.reachId,
      })),
    });
  }, [detail, evidenceQ.data, hypQ.data, timelineQ.data, recsQ.data, tasksQ.data]);

  const displayEvent = useMemo(() => {
    if (!caseEvent) return null;
    if (!trigger) return caseEvent;
    const label = simMetricName(trigger.metric);
    const peakText = trend.peak !== null
      ? (Number.isInteger(trend.peak) ? String(trend.peak) : trend.peak.toFixed(2))
      : '—';
    return {
      ...caseEvent,
      reading: {
        ...caseEvent.reading,
        label: `${label}峰值`,
        value: peakText,
        unit: trend.unit,
        delta: trend.peak !== null ? `${trend.source.label} · ${trend.samples} 个样本` : `触发幅度 ${trigger.magnitude} · 暂无观测序列`,
        spark: trend.spark,
      },
      coordinates: `${reachName(trigger.reachId)} · ${label}`,
    };
  }, [caseEvent, trigger, trend]);

  const allBusinessTimeline = useMemo(() => (displayEvent?.timeline ?? []).filter((step) => step.bizType !== 'BLINDSPOT'), [displayEvent]);
  // 关键节点只保留任务/现场/复核/证据/评估等里程碑；事件状态高频翻转放到全部记录。
  const keyTimeline = useMemo(() => allBusinessTimeline.filter((step) => step.bizType !== 'EVENT'), [allBusinessTimeline]);
  const logTimeline = useMemo(() => (displayEvent?.timeline ?? []).filter((step) => step.bizType === 'BLINDSPOT'), [displayEvent]);
  const visibleTimeline = timelineMode === 'key'
    ? keyTimeline
    : [...logTimeline.slice(0, logsExpanded ? logTimeline.length : 5), ...allBusinessTimeline];

  async function doAction(action: EventAction) {
    setError(''); setBusy(action);
    try {
      await api.eventAction(eventId, action, reason.trim() || undefined);
      setReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['event-timeline', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['event-recs', eventId] }),
      ]);
    } catch (exc) {
      if (exc instanceof ApiError) {
        setError(`${exc.code === 'STATE_CONFLICT' ? '当前状态不允许该操作' : exc.message}${exc.details ? `（${JSON.stringify(exc.details)}）` : ''}`);
      } else setError((exc as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!eventId) {
    return (
      <Panel code="02" title="事件研判工作台" en="CASE WORKBENCH" className="v2-case-panel">
        <PanelState variant="empty" title="请选择左侧事件" desc="选择事件后可查看证据链、研判假设与处置建议。" />
      </Panel>
    );
  }
  if (eventQ.isError) {
    return (
      <Panel code="02" title="事件研判工作台" en="CASE WORKBENCH" className="v2-case-panel">
        <PanelState variant="error" title="研判数据加载失败" desc={(eventQ.error as Error).message}
          action={<button type="button" className="v2-btn v2-btn--primary" onClick={() => void eventQ.refetch()}>重新加载</button>} />
      </Panel>
    );
  }
  if (eventQ.isLoading || !displayEvent) {
    return (
      <Panel code="02" title="事件研判工作台" en="CASE WORKBENCH" className="v2-case-panel">
        <PanelState variant="loading" title="研判数据加载中…" />
      </Panel>
    );
  }

  const riskTone = displayEvent.risk === 'high' ? 'high' : displayEvent.risk === 'medium' ? 'mid' : 'default';
  const stage = STAGE_BY_STATUS[displayEvent.status] ?? 0;
  const primaryHyp = displayEvent.hypotheses.find((h) => h.selected) ?? displayEvent.hypotheses[0];
  const alternatives = displayEvent.hypotheses.filter((h) => h !== primaryHyp);
  const suggestions = displayEvent.suggestions;
  const tasks = (tasksQ.data?.items ?? []);
  const allowed = detail?.allowedActions ?? [];

  return (
    <>
      <Panel
        code="02"
        title="事件研判工作台"
        en="CASE WORKBENCH"
        className="v2-case-panel"
        actions={
          <>
            <span className="v2-case-panel__count v2-mono">证据归档 {String(displayEvent.evidence.length).padStart(2, '0')}</span>
            {onOpenFull && <button type="button" className="v2-panel-link" onClick={onOpenFull}>完整研判<Icon name="arrow-right" size={11} /></button>}
          </>
        }
        footer={
          <div className="v2-case-actions">
            <span className="v2-case-actions__state">
              <span className={`v2-status-dot v2-status-dot--${displayEvent.risk === 'high' ? 'danger' : displayEvent.risk === 'medium' ? 'warn' : 'good'}`} />
              当前状态 · {displayEvent.status}
              <span className="v2-case-actions__elapsed">{displayEvent.originalStatus}</span>
            </span>
            <input
              className="v2-input v2-case-actions__reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="处置理由（可选）"
              aria-label="处置理由"
            />
            <div className="v2-case-actions__buttons">
              {allowed.length === 0 && <span className="v2-muted">当前状态暂无可执行操作</span>}
              {allowed.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={`v2-btn ${action === 'ESCALATE' || action === 'MARK_UNRESOLVED' ? 'v2-btn--ghost' : 'v2-btn--primary'}`}
                  disabled={busy !== null}
                  onClick={() => void doAction(action)}
                >
                  {busy === action ? '执行中…' : EVENT_ACTION_LABEL[action] ?? action}
                </button>
              ))}
            </div>
            {error && <div className="v2-case-actions__error">{error}</div>}
          </div>
        }
      >
        <div className="v2-case-head">
          <div className="v2-case-head__main">
            <div className="v2-case-head__meta">
              <span className="v2-case-head__id v2-mono">{displayEvent.id}</span>
              <Badge tone={riskTone}>{RISK_CODE[displayEvent.risk]} · {RISK_LABEL[displayEvent.risk]}</Badge>
              <span className={`v2-case-status v2-case-status--${STATUS_KEY[displayEvent.status]}`}>{displayEvent.status}</span>
              <span className="v2-case-head__divider" />
              <span className="v2-mono">{displayEvent.occurredAt}</span>
              <span className="v2-case-head__dot">·</span>
              <span>{displayEvent.location}</span>
            </div>
            <h3 className="v2-case-title">{displayEvent.title}</h3>
            <p className="v2-case-summary">{displayEvent.summary}</p>
          </div>
          <div className={`v2-case-reading v2-case-reading--${displayEvent.reading.tone}`}>
            <span className="v2-case-reading__label">{displayEvent.reading.label}</span>
            <div className="v2-case-reading__value">
              <b className="v2-mono">{displayEvent.reading.value}</b>
              {displayEvent.reading.unit && <small>{displayEvent.reading.unit}</small>}
            </div>
            <span className="v2-case-reading__delta v2-mono">{displayEvent.reading.delta}</span>
            {displayEvent.reading.spark && displayEvent.reading.spark.length > 1 && (
              <Sparkline values={displayEvent.reading.spark} width={126} height={26} tone={displayEvent.reading.tone === 'alert' ? 'alert' : displayEvent.reading.tone === 'watch' ? 'watch' : 'good'} />
            )}
            <span className="v2-case-reading__coords v2-mono">{displayEvent.coordinates}</span>
          </div>
        </div>

        <ol className="v2-case-stages" aria-label="事件处置阶段">
          {CASE_STAGES.map((label, index) => {
            const state = stage >= CASE_STAGES.length ? 'done' : index < stage ? 'done' : index === stage ? 'active' : 'todo';
            return (
              <li key={label} className={`v2-case-stage v2-case-stage--${state}`}>
                <span className="v2-case-stage__node">{state === 'done' ? <Icon name="check" size={10} /> : String(index + 1).padStart(2, '0')}</span>
                <span className="v2-case-stage__label">{label}</span>
                {index < CASE_STAGES.length - 1 && <span className="v2-case-stage__line" />}
              </li>
            );
          })}
        </ol>

        <div className="v2-case-body">
          <div className="v2-case-col">
            <section className="v2-case-section">
              <header className="v2-case-section__head">
                <h4>关键证据</h4><span>EVIDENCE</span>
                <button type="button" className="v2-panel-link v2-case-section__link" onClick={() => setEvidenceOpen(true)}>
                  查看全部 {displayEvent.evidence.length} 项<Icon name="arrow-right" size={12} />
                </button>
              </header>
              <div className="v2-evidence-list">
                {displayEvent.evidence.length === 0 && <p className="v2-muted">暂无证据</p>}
                {displayEvent.evidence.slice(0, 3).map((item) => (
                  <div className="v2-evidence-item" key={item.id}>
                    <span className={`v2-evidence-item__type v2-evidence-item__type--${item.type}`}>
                      <Icon name={EVIDENCE_ICON[item.type]} size={15} />
                    </span>
                    <div className="v2-evidence-item__main">
                      <div className="v2-evidence-item__title">{item.title}<span className="v2-mono">{item.time}</span></div>
                      <p>{item.desc}</p>
                    </div>
                    {item.value && <div className="v2-evidence-item__side"><span className="v2-evidence-item__value v2-mono">{item.value}</span></div>}
                  </div>
                ))}
              </div>
            </section>

            <section className="v2-case-section">
              <header className="v2-case-section__head">
                <h4>研判假设</h4><span>HYPOTHESIS</span>
                {primaryHyp?.supportRatio !== null && primaryHyp?.supportRatio !== undefined && (
                  <span className="v2-case-section__aside v2-mono">证据支持占比 {primaryHyp.supportRatio}%</span>
                )}
              </header>
              {!primaryHyp ? <p className="v2-muted">暂无研判假设</p> : (
                <>
                  <div className="v2-hypothesis-main">
                    <div className="v2-hypothesis-main__head">
                      <h5>{primaryHyp.title}</h5>
                      <b className="v2-mono">{primaryHyp.supportRatio !== null && primaryHyp.supportRatio !== undefined ? `${primaryHyp.supportRatio}%` : '—'}</b>
                    </div>
                    {primaryHyp.supportRatio !== null && primaryHyp.supportRatio !== undefined && (
                      <div className="v2-confidence-bar"><i style={{ width: `${primaryHyp.supportRatio}%` }} /></div>
                    )}
                    <p>{primaryHyp.basis}</p>
                  </div>
                  {alternatives.length > 0 && (
                    <div className="v2-hypothesis-alts">
                      {alternatives.map((item) => (
                        <div className="v2-hypothesis-alt" key={item.title}>
                          <span className="v2-hypothesis-alt__title">{item.title}</span>
                          <span className="v2-hypothesis-alt__confidence v2-mono">{item.supportRatio !== null && item.supportRatio !== undefined ? `${item.supportRatio}%` : '—'}</span>
                          <p>{item.basis}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="v2-case-section v2-case-section--last">
              <header className="v2-case-section__head"><h4>处置建议</h4><span>NEXT ACTIONS</span></header>
              {suggestions.length === 0 ? <p className="v2-muted">当前状态暂无规则建议。</p> : (
                <ol className="v2-suggestion-list">
                  {suggestions.map((suggestion, index) => {
                    const rec = (recsQ.data?.items ?? [])[index];
                    return (
                      <li key={suggestion.title} className={`v2-suggestion v2-suggestion--${suggestion.priority === '高' ? 'high' : suggestion.priority === '中' ? 'mid' : 'low'}`}>
                        <span className="v2-suggestion__priority">{suggestion.priority}</span>
                        <div className="v2-suggestion__main"><b>{suggestion.title}</b><p>{suggestion.desc}</p></div>
                        {rec?.category === 'TASK' && rec.suggestedTask && (
                          <button type="button" className="v2-suggestion__action" onClick={() => setDispatchRec(rec)}>派发任务<Icon name="chevron-right" size={12} /></button>
                        )}
                        {rec?.category === 'EVENT_ACTION' && rec.eventAction && (
                          <button type="button" className="v2-suggestion__action" onClick={() => void doAction(rec.eventAction as EventAction)}>
                            {EVENT_ACTION_LABEL[rec.eventAction as EventAction] ?? rec.eventAction}<Icon name="chevron-right" size={12} />
                          </button>
                        )}
                        {!rec?.suggestedTask && rec?.category !== 'EVENT_ACTION' && (
                          <span className="v2-suggestion__action is-static">{suggestion.action}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <div className="v2-case-col v2-case-col--side">
            <section className="v2-case-section">
              <header className="v2-case-section__head">
                <h4>事件时间线</h4><span>TIMELINE</span>
                <Segmented
                  ariaLabel="时间线视图" mini value={timelineMode} onChange={setTimelineMode}
                  options={[{ value: 'key', label: '关键节点' }, { value: 'all', label: '全部记录' }]}
                />
              </header>
              <div className="v2-timeline-scroll">
                {timelineMode === 'all' && logTimeline.length > 0 && (
                  <div className="v2-timeline-logfold">
                    <button type="button" className="v2-timeline-logfold__btn" onClick={() => setLogsExpanded((v) => !v)}>
                      <Icon name="search" size={11} />
                      {logsExpanded ? '收起' : '展开'}系统日志（{logTimeline.length} 条）
                      <Icon name="chevron-right" size={11} style={{ transform: logsExpanded ? 'rotate(90deg)' : undefined }} />
                    </button>
                  </div>
                )}
                <ol className="v2-case-timeline">
                  {visibleTimeline.length === 0 && <li className="v2-muted">暂无时间线记录</li>}
                  {visibleTimeline.map((step, index) => <TimelineRow key={`${step.time}-${step.action}-${index}`} step={step} />)}
                </ol>
              </div>
              <div className="v2-timeline-foot v2-mono">
                {timelineMode === 'key' ? `关键节点 ${keyTimeline.length} 条 · 全部记录 ${displayEvent.timeline.length} 条` : `全部 ${displayEvent.timeline.length} 条业务记录`}
              </div>
            </section>

            <section className="v2-case-section">
              <header className="v2-case-section__head">
                <h4>关联巡检任务</h4><span>FIELD TASK</span>
                {tasks.length > 0 && <Link to="/tasks" className="v2-case-section__link v2-panel-link">全部 {tasks.length}<Icon name="arrow-right" size={12} /></Link>}
              </header>
              {displayEvent.linkedTask ? (
                <Link to="/tasks" className="v2-linked-task">
                  <span className="v2-linked-task__top"><span className="v2-mono">{displayEvent.linkedTask.id}</span><span className="v2-linked-task__status">{TASK_STATUS_CN[displayEvent.linkedTask.status] ?? displayEvent.linkedTask.status}</span><Icon name="arrow-up-right" size={13} className="v2-linked-task__arrow" /></span>
                  <b>{displayEvent.linkedTask.title}</b>
                  <span className="v2-linked-task__meta"><span>执行人 {displayEvent.linkedTask.assignee}</span><span className="v2-mono">{displayEvent.linkedTask.time}</span></span>
                </Link>
              ) : (
                <div className="v2-linked-task v2-linked-task--empty"><span className="v2-status-dot v2-status-dot--idle" />尚未关联巡检任务</div>
              )}
            </section>

            <div className="v2-case-side-note">
              <span>证据由监测引擎自动归集 · 状态机真实操作</span>
              <span className="v2-mono">{EVENT_STATUS_GROUP[displayEvent.originalStatus] ?? '—'}</span>
            </div>
          </div>
        </div>
      </Panel>

      <EvidenceDrawer event={displayEvent} open={evidenceOpen} onClose={() => setEvidenceOpen(false)} />

      {dispatchRec && (
        <DispatchTaskDrawer
          eventId={eventId}
          rec={dispatchRec}
          onClose={() => setDispatchRec(null)}
          onDone={() => {
            setDispatchRec(null);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['tasks', 'by-event', eventId] });
            queryClient.invalidateQueries({ queryKey: ['event-timeline', eventId] });
            queryClient.invalidateQueries({ queryKey: ['event-recs', eventId] });
          }}
        />
      )}
    </>
  );
}
