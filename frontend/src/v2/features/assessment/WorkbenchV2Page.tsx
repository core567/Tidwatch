import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '@/services/apiClient';
import { buildCaseEvent, originalStatusLabel } from './assessmentAdapter';
import { STATUS_KEY, EVENT_STATUS_GROUP, EVIDENCE_ICON } from './meta';
import { EvidenceDrawer } from './EvidenceDrawer';
import { Drawer } from '../../components/ui/Drawer';
import { Segmented } from '../../components/ui/Segmented';
import { Badge } from '../../components/ui/Badge';
import { Icon, type IconName } from '../../components/ui/Icon';
import { PanelState } from '../../components/ui/PanelState';
import { EVENT_ACTION_LABEL } from '@/lib/eventActions';
import { reachName } from '@/components/EventBits';
import type { EventAction, Evidence, Hypothesis, Recommendation, TimelineItem } from '@/types/contract';
import type { TimelineStep } from './assessmentTypes';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/assessment.css';

const TASK_STATUS_CN: Record<string, string> = {
  DRAFT: '草稿', PENDING: '待派发', ACCEPTED: '已接单', IN_PROGRESS: '执行中',
  SUBMITTED: '待复核', APPROVED: '已完成', CANCELLED: '已取消',
};

const BIZ_ICON: Record<string, IconName> = {
  EVENT: 'assessment', TASK: 'inspection', SUBMISSION: 'send', REVIEW: 'review',
  ASSESSMENT: 'analysis', EVIDENCE: 'camera', BLINDSPOT: 'search',
  ATTACHMENT: 'layers', RECOVERY: 'refresh',
};

const TIMELINE_BTN: Record<string, string> = {
  EVENT: '事件流转', TASK: '任务动态', SUBMISSION: '现场提交', REVIEW: '复核记录',
  ASSESSMENT: '研判评估', EVIDENCE: '证据归档', BLINDSPOT: '盲区扫描',
  ATTACHMENT: '附件上传', RECOVERY: '恢复评估',
};

function TimelineItemRow({ step }: { step: TimelineStep }) {
  const keyType = TIMELINE_BTN[step.bizType ?? ''] ?? step.bizType ?? 'EVENT';
  return (
    <li className={`v2-case-timeline__item v2-case-timeline__item--${step.state}`}>
      <span className={`v2-case-timeline__dot v2-case-timeline__dot--${step.bizType ?? 'EVENT'}`}>
        <Icon name={BIZ_ICON[step.bizType ?? ''] ?? 'wave'} size={11} />
      </span>
      <div className="v2-case-timeline__main">
        <div className="v2-case-timeline__meta">
          <span className="v2-case-timeline__btn v2-mono">{keyType}</span>
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
 * F5 研判工作台（终版）：
 * - 时间线双视图：关键节点（默认，过滤盲区扫描高频日志）/ 全部记录（系统日志分组折叠，可展开追溯）
 * - 右侧深色建议区（规则建议 + 派单抽屉，复用原 createTask 流程）
 * - 三栏等高滚动，操作区不随长页面被挤到底部
 */
export default function WorkbenchV2Page() {
  const { eventId = '' } = useParams();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<EventAction | null>(null);
  const [error, setError] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [timelineMode, setTimelineMode] = useState<'key' | 'all'>('key');
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [dispatchRec, setDispatchRec] = useState<Recommendation | null>(null);

  const eventQ = useQuery({ queryKey: ['event', eventId], queryFn: () => api.event(eventId), refetchInterval: 8000 });
  const evidenceQ = useQuery({ queryKey: ['evidence', eventId], queryFn: () => api.evidence(eventId), refetchInterval: 15000 });
  const hypQ = useQuery({ queryKey: ['hypotheses', eventId], queryFn: () => api.hypotheses(eventId), refetchInterval: 15000 });
  const timelineQ = useQuery({ queryKey: ['event-timeline', eventId], queryFn: () => api.eventTimeline(eventId), refetchInterval: 8000 });
  const recsQ = useQuery({ queryKey: ['event-recs', eventId], queryFn: () => api.eventRecommendations(eventId), refetchInterval: 30000 });
  const tasksQ = useQuery({ queryKey: ['tasks', 'by-event', eventId], queryFn: () => api.tasks({ eventId }), refetchInterval: 8000 });

  const detail = eventQ.data;
  const caseEvent = useMemo(() => {
    if (!detail) return null;
    return buildCaseEvent({
      detail,
      evidence: (evidenceQ.data ?? []) as Evidence[],
      hypotheses: (hypQ.data ?? []) as Hypothesis[],
      timeline: (timelineQ.data?.items ?? []) as TimelineItem[],
      suggestions: (recsQ.data?.items ?? []) as Recommendation[],
      tasks: (tasksQ.data?.items ?? []).map((t) => ({
        taskId: t.taskId, title: t.title, status: t.status, assignee: t.assignee, createdAt: t.createdAt, reachId: t.reachId,
      })),
    });
  }, [detail, evidenceQ.data, hypQ.data, timelineQ.data, recsQ.data, tasksQ.data]);

  const keyTimeline = useMemo(() => (caseEvent?.timeline ?? []).filter((s) => s.bizType !== 'BLINDSPOT'), [caseEvent]);
  const logTimeline = useMemo(() => (caseEvent?.timeline ?? []).filter((s) => s.bizType === 'BLINDSPOT'), [caseEvent]);
  const visibleTimeline =
    timelineMode === 'key' ? keyTimeline : [...logTimeline.slice(0, logsExpanded ? logTimeline.length : 5), ...keyTimeline];

  async function doAction(action: EventAction) {
    setError('');
    setBusy(action);
    try {
      await api.eventAction(eventId, action, reason.trim() || undefined);
      setReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['event-timeline', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['event-recs', eventId] }),
      ]);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code === 'STATE_CONFLICT' ? '当前状态不允许该操作' : e.message}${e.details ? `（${JSON.stringify(e.details)}）` : ''}`);
      } else setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (eventQ.isLoading || !detail || !caseEvent) {
    return (
      <div className="v2-scope">
        <div className="v2-page">
          <div className="v2-panel v2-state-page"><PanelState variant="loading" title="研判数据加载中…" /></div>
        </div>
      </div>
    );
  }

  const primaryHyp = caseEvent.hypotheses.find((h) => h.selected) ?? caseEvent.hypotheses[0];

  return (
    <div className="v2-scope">
      <div className="v2-page v2-workbench-page">
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>CASE WORKBENCH · {caseEvent.id}</span>
            </div>
            <h1 className="v2-page-title">异常研判与处置<em>WORKBENCH</em></h1>
            <p className="v2-page-situation">{caseEvent.title}</p>
          </div>
          <div className="v2-readouts">
            <div className="v2-readout">
              <span className="v2-readout__label">STATUS</span>
              <div className="v2-readout__value"><Badge tone={caseEvent.risk === 'high' ? 'high' : 'mid'}>{caseEvent.riskCode} · {caseEvent.riskLabel}</Badge></div>
              <div className="v2-readout__sub">
                <span className={`v2-case-status v2-case-status--${STATUS_KEY[caseEvent.status]}`}>{caseEvent.status}</span>
                <span className="v2-mono"> · {originalStatusLabel(caseEvent.originalStatus)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="v2-workbench-grid">
          {/* 左栏 */}
          <div className="v2-workbench-col v2-workbench-col--left">
            <section className="v2-case-section">
              <header className="v2-case-section__head"><h4>事件概况</h4><span>OVERVIEW</span></header>
              <div className="v2-case-kv">
                <div><span>涉及断面</span><b>{caseEvent.location}</b></div>
                <div><span>首发时间</span><b className="v2-mono">{caseEvent.occurredAt}</b></div>
                <div><span>异常指标</span><b className="v2-mono">{caseEvent.reading.label} {caseEvent.reading.value}</b></div>
                <div><span>版本</span><b className="v2-mono">{caseEvent.elapsed}</b></div>
              </div>
            </section>

            <section className="v2-case-section">
              <header className="v2-case-section__head">
                <h4>关键证据</h4><span>EVIDENCE</span>
                <button type="button" className="v2-panel-link v2-case-section__link" onClick={() => setEvidenceOpen(true)}>
                  查看全部 {caseEvent.evidence.length} 项<Icon name="arrow-right" size={12} />
                </button>
              </header>
              <div className="v2-evidence-list">
                {caseEvent.evidence.length === 0 && <p className="v2-muted">暂无证据</p>}
                {caseEvent.evidence.slice(0, 3).map((item) => (
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

            <section className="v2-case-section v2-case-section--last">
              <header className="v2-case-section__head"><h4>研判假设</h4><span>HYPOTHESIS</span></header>
              {caseEvent.hypotheses.length === 0 ? (
                <p className="v2-muted">暂无研判假设</p>
              ) : (
                <>
                  <div className="v2-hypothesis-main">
                    <div className="v2-hypothesis-main__head">
                      <h5>{primaryHyp.title}</h5>
                      <b className="v2-mono">{primaryHyp.confidence !== null ? `${primaryHyp.confidence}%` : '—'}</b>
                    </div>
                    <p>{primaryHyp.basis}</p>
                  </div>
                  {caseEvent.hypotheses.slice(1).map((item) => (
                    <div className="v2-hypothesis-alt" key={item.title}>
                      <span className="v2-hypothesis-alt__title">{item.title}</span>
                      <p>{item.basis}</p>
                    </div>
                  ))}
                </>
              )}
            </section>
          </div>

          {/* 中栏：时间线（滚动容器，双视图） */}
          <div className="v2-workbench-col v2-workbench-col--main">
            <section className="v2-case-section v2-case-section--last v2-timeline-panel">
              <header className="v2-case-section__head">
                <h4>统一业务时间线</h4><span>TIMELINE</span>
                <Segmented
                  ariaLabel="时间线视图"
                  mini
                  value={timelineMode}
                  onChange={setTimelineMode}
                  options={[
                    { value: 'key', label: '关键节点' },
                    { value: 'all', label: '全部记录' },
                  ]}
                />
              </header>
              <div className="v2-timeline-scroll">
                {timelineMode === 'all' && logTimeline.length > 0 && (
                  <div className="v2-timeline-logfold">
                    <button type="button" className="v2-timeline-logfold__btn" onClick={() => setLogsExpanded((v) => !v)}>
                      <Icon name="search" size={11} />
                      {logsExpanded ? '收起' : '展开'}系统日志（盲区扫描等 {logTimeline.length} 条）
                      <Icon name="chevron-right" size={11} style={{ transform: logsExpanded ? 'rotate(90deg)' : undefined }} />
                    </button>
                  </div>
                )}
                <ol className="v2-case-timeline">
                  {visibleTimeline.length === 0 && <li className="v2-muted">暂无时间线记录</li>}
                  {visibleTimeline.map((step, index) => (
                    <TimelineItemRow key={`${step.action}-${step.time}-${index}`} step={step} />
                  ))}
                </ol>
              </div>
              <div className="v2-timeline-foot v2-mono">
                {timelineMode === 'key'
                  ? `关键节点 ${keyTimeline.length} 条${logTimeline.length ? ` · 系统日志 ${logTimeline.length} 条（全部记录视图可追溯）` : ''}`
                  : `全部 ${caseEvent.timeline.length} 条业务记录 · 真实数据`}
              </div>
            </section>
          </div>

          {/* 右栏：建议 + 任务 + 操作 */}
          <div className="v2-workbench-col v2-workbench-col--right">
            <section className="v2-case-section">
              <header className="v2-case-section__head">
                <h4>处置建议</h4><span>RECOMMENDATIONS</span>
                <span className="v2-case-section__aside">规则建议</span>
              </header>
              {caseEvent.suggestions.length === 0 ? (
                <p className="v2-muted">当前状态暂无规则建议。</p>
              ) : (
                <ol className="v2-suggestion-list">
                  {caseEvent.suggestions.map((s, i) => {
                    const rec = (recsQ.data?.items ?? [])[i];
                    return (
                      <li key={s.title} className={`v2-suggestion v2-suggestion--${s.priority === '高' ? 'high' : s.priority === '中' ? 'mid' : 'low'}`}>
                        <span className="v2-suggestion__priority">{s.priority}</span>
                        <div className="v2-suggestion__main">
                          <b>{s.title}</b>
                          <p>{s.desc}</p>
                        </div>
                        {rec?.category === 'TASK' && rec.suggestedTask && (
                          <button type="button" className="v2-suggestion__action" onClick={() => setDispatchRec(rec)}>
                            派发任务<Icon name="chevron-right" size={12} />
                          </button>
                        )}
                        {rec?.category === 'EVENT_ACTION' && rec.eventAction && (
                          <button type="button" className="v2-suggestion__action" onClick={() => void doAction(rec.eventAction as EventAction)}>
                            {EVENT_ACTION_LABEL[rec.eventAction as EventAction] ?? rec.eventAction}<Icon name="chevron-right" size={12} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="v2-case-section">
              <header className="v2-case-section__head">
                <h4>关联任务</h4><span>FIELD TASKS</span>
                <Link to="/tasks" className="v2-panel-link">全部<Icon name="arrow-right" size={12} /></Link>
              </header>
              {caseEvent.linkedTask ? (
                <Link to="/tasks" className="v2-linked-task">
                  <span className="v2-linked-task__top"><span className="v2-mono">{caseEvent.linkedTask.id}</span><span className="v2-linked-task__status">{TASK_STATUS_CN[caseEvent.linkedTask.status] ?? caseEvent.linkedTask.status}</span></span>
                  <b>{caseEvent.linkedTask.title}</b>
                  <span className="v2-linked-task__meta"><span>执行人 {caseEvent.linkedTask.assignee}</span><span className="v2-mono">{caseEvent.linkedTask.time}</span></span>
                </Link>
              ) : (
                <div className="v2-linked-task v2-linked-task--empty"><span className="v2-status-dot v2-status-dot--idle" />尚未关联巡检任务，确认研判后可派发</div>
              )}
            </section>

            <section className="v2-case-section v2-case-section--last">
              <header className="v2-case-section__head"><h4>状态操作</h4><span>ACTIONS</span></header>
              <p className="v2-muted">仅显示当前状态允许的操作</p>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="处置理由（可选，写入运行轨迹）" className="v2-textarea" rows={2} />
              <div className="v2-case-actions__buttons">
                {(detail.allowedActions ?? []).length === 0 && <span className="v2-muted">当前状态暂无可执行操作</span>}
                {(detail.allowedActions ?? []).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`v2-btn ${a === 'ESCALATE' || a === 'MARK_UNRESOLVED' ? 'v2-btn--ghost' : 'v2-btn--primary'} ${busy !== null ? 'v2-btn--disabled' : ''}`.trim()}
                    disabled={busy !== null}
                    onClick={() => void doAction(a)}
                  >
                    {busy === a ? '执行中…' : EVENT_ACTION_LABEL[a] ?? a}
                  </button>
                ))}
              </div>
              {error && <div className="v2-case-actions__error">{error}</div>}
              <div className="v2-case-actions__state v2-mono">
                业务阶段 {EVENT_STATUS_GROUP[caseEvent.originalStatus] ?? '—'} · 原始状态 {caseEvent.originalStatus}
              </div>
            </section>
          </div>
        </div>
      </div>

      <EvidenceDrawer event={caseEvent} open={evidenceOpen} onClose={() => setEvidenceOpen(false)} />

      {dispatchRec && (
        <DispatchDrawerV2
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
    </div>
  );
}

/** v2 深色派单抽屉：复用原 createTask 真实流程 */
function DispatchDrawerV2({ eventId, rec, onClose, onDone }: {
  eventId: string;
  rec: Recommendation;
  onClose: () => void;
  onDone: () => void;
}) {
  const reachId = rec.suggestedTask?.reachId ?? rec.reachIds?.[0] ?? 'reach-a';
  const [title, setTitle] = useState(`现场核查 ${reachName(reachId)}`);
  const [reasonTxt, setReasonTxt] = useState(rec.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (title.trim().length < 2) { setError('任务标题至少 2 个字符'); return; }
    setBusy(true);
    setError('');
    try {
      await api.createTask({ eventId, reachId, title: title.trim(), reason: reasonTxt.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Drawer open title="派发现场核查" subtitle="规则仅生成草稿，需人工确认后创建" onClose={onClose}>
      <div className="v2-stack" style={{ gap: 12 }}>
        <div className="v2-field">
          <span className="v2-field__label">关联事件</span>
          <span className="v2-mono">{eventId}</span>
        </div>
        <div className="v2-field">
          <span className="v2-field__label">目标断面</span>
          <span className="v2-mono">{reachName(reachId)}</span>
        </div>
        <div className="v2-field">
          <span className="v2-field__label">任务标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="v2-input" style={{ width: '100%' }} />
        </div>
        <div className="v2-field">
          <span className="v2-field__label">派发理由</span>
          <textarea value={reasonTxt} onChange={(e) => setReasonTxt(e.target.value)} className="v2-textarea" rows={3} />
        </div>
        {error && <div className="v2-case-actions__error">{error}</div>}
        <div className="v2-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="v2-btn v2-btn--ghost" onClick={onClose}>取消</button>
          <button type="button" className="v2-btn v2-btn--primary" onClick={() => void submit()} disabled={busy}>
            {busy ? '派发中…' : '确认派发'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
