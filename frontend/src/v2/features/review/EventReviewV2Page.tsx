import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EVENT_STATUS, formatTime, reachName } from '@/components/EventBits';
import { api } from '@/services/apiClient';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { PanelState } from '../../components/ui/PanelState';
import type { ReviewTaskRecord, TaskReviewRecord, TaskSubmission } from '@/types/contract';
import { ReviewAnalysisGrid, ReviewConclusionBlock, ReviewReportHead, ReviewStatGrid } from './EventReportPanel';
import { ReviewTimeline } from './ReviewTimeline';
import { BlindSpotPanel } from './BlindSpotPanel';
import {
  EVIDENCE_TYPE_CN,
  displayIso,
  metricUnit,
  peakInWindow,
  priorityMetaSafe,
} from './reviewModel';
import { useEventDossier } from './useEventDossier';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/review.css';
import '../../styles/review-layout.css';

/**
 * F7.1.3 事件复盘详情：与总览报告同一套深色语言，保留完整复盘能力
 * （趋势、恢复评估、风险轨、统一时间线、现场提交/复核、证据全量、盲区、结论）。
 */
export default function EventReviewV2Page() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const dossier = useEventDossier(eventId);
  const { event, review, assess, timeline, observations, chartWindow, loading, error } = dossier;

  if (loading && !review) {
    return (
      <div className="v2-scope">
        <div className="v2-page"><div className="v2-panel v2-state-page"><PanelState variant="loading" title="复盘数据加载中…" /></div></div>
      </div>
    );
  }
  if (error || !event || !review) {
    return (
      <div className="v2-scope"><div className="v2-page">
        <div className="v2-panel v2-state-page">
          <div className="v2-state__title">复盘数据加载失败</div>
          <p className="v2-muted">{error ? (error as Error).message : '未找到事件复盘记录'}</p>
          <button type="button" className="v2-btn v2-btn--primary" onClick={() => dossier.refetch()}>重新加载</button>
        </div>
      </div></div>
    );
  }

  const priority = priorityMetaSafe(event.priority);
  const status = EVENT_STATUS[event.status]?.text ?? event.status;
  const peak = peakInWindow(observations, chartWindow);
  const unit = metricUnit(chartWindow, observations);

  return (
    <div className="v2-scope">
      <div className="v2-page v2-review-detail">
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>REVIEW · {event.eventId}</span>
            </div>
            <h1 className="v2-page-title">{event.title}<em>EVENT REVIEW</em></h1>
            <p className="v2-page-situation">
              <b>{priority.code} · {priority.label}</b> · {status} · 涉及 {event.scopeReachIds.map(reachName).join(' → ') || '—'}
            </p>
          </div>
          <div className="v2-review-head-actions v2-no-print">
            <button type="button" className="v2-btn v2-btn--ghost" onClick={() => navigate('/review')}>
              <Icon name="arrow-right" size={12} style={{ transform: 'rotate(180deg)' }} />复盘列表
            </button>
            <button type="button" className="v2-btn v2-btn--ghost" onClick={() => navigate(`/events/${eventId}/workbench`)}>研判工作台</button>
            <button type="button" className="v2-btn v2-btn--ghost" onClick={() => window.print()}><Icon name="download" size={12} />打印</button>
            <button type="button" className="v2-btn v2-btn--primary" onClick={() => navigate(`/review/${eventId}/report`)}>
              <Icon name="download" size={12} />导出完整报告
            </button>
          </div>
        </div>

        <Panel code="02" title="事件复盘报告" en="INCIDENT REPORT" className="v2-report-panel v2-report-panel--detail">
          <ReviewReportHead event={event} review={review} assess={assess} />
          <ReviewStatGrid event={event} review={review} assess={assess} peak={peak} unit={unit} />
          <ReviewAnalysisGrid dossier={dossier} />
        </Panel>

        <Panel
          code="03"
          title="统一业务时间线"
          en="BUSINESS TIMELINE"
          className="v2-review-section"
          actions={<Badge>{timeline.length} 条原始记录</Badge>}
        >
          <ReviewTimeline items={timeline} />
        </Panel>

        <Panel
          code="04"
          title="现场处置与复核"
          en="FIELD & REVIEW"
          className="v2-review-section"
          actions={<Badge>{review.tasks.length} 项任务</Badge>}
        >
          {review.tasks.length === 0 ? (
            <p className="v2-report-empty">该事件暂无关联巡检任务</p>
          ) : (
            <div className="v2-field-tasks">
              {review.tasks.map((task) => <FieldTask key={task.id} task={task} />)}
            </div>
          )}
        </Panel>

        <Panel
          code="05"
          title="证据与研判全量"
          en="EVIDENCE & HYPOTHESES"
          className="v2-review-section"
          actions={<Badge>{review.supportingEvidence.length + review.counterEvidence.length} 条证据</Badge>}
        >
          <div className="v2-review-evidence-grid">
            <EvidenceList title="支持证据" en="SUPPORTING" items={review.supportingEvidence} tone="live" />
            <EvidenceList title="反证 / 缺失" en="COUNTER" items={review.counterEvidence} tone="high" />
            <section className="v2-review-subblock">
              <header><h4>研判假设</h4><span>HYPOTHESES</span><Badge>{review.hypotheses.length}</Badge></header>
              {review.hypotheses.length === 0 ? <p className="v2-report-empty">暂无研判假设</p> : review.hypotheses.map((h) => (
                <div className="v2-review-ev-row" key={h.id}>
                  <Badge tone={h.state === 'SUPPORT' ? 'live' : 'default'}>{h.state}</Badge>
                  <span>{h.statement}</span>
                  <span className="v2-mono v2-muted">支持 {h.support} · 反证 {h.counter}</span>
                </div>
              ))}
            </section>
            <BlindSpotPanel records={review.blindSpots ?? []} timeline={timeline} />
            <section className="v2-review-subblock">
              <header><h4>跨断面时序</h4><span>TEMPORAL</span><Badge>{review.temporalRelations.length}</Badge></header>
              {review.temporalRelations.length === 0 ? <p className="v2-report-empty">无时序关系记录</p> : review.temporalRelations.map((t, i) => (
                <div className="v2-review-ev-row" key={i}>
                  <span>相差 <b>{Math.round(t.deltaSeconds / 60)}</b> 分钟</span>
                  <span className="v2-muted">{t.note}（时序先后不构成因果）</span>
                </div>
              ))}
            </section>
            <section className="v2-review-subblock">
              <header><h4>范围演化</h4><span>SCOPE HISTORY</span><Badge>{review.scopeHistory.length}</Badge></header>
              {review.scopeHistory.length === 0 ? <p className="v2-report-empty">无范围版本记录</p> : review.scopeHistory.map((s) => (
                <div className="v2-review-ev-row" key={s.version}>
                  <Badge>v{s.version}</Badge>
                  <span>{s.reaches.map(reachName).join(' → ') || '—'}</span>
                  {s.reason && <span className="v2-muted">{s.reason}</span>}
                </div>
              ))}
            </section>
            <section className="v2-review-subblock">
              <header><h4>再评估记录</h4><span>RE-ASSESSMENT</span><Badge>{review.assessments.length}</Badge></header>
              {review.assessments.length === 0 ? <p className="v2-report-empty">无再评估记录</p> : review.assessments.map((a) => (
                <div className="v2-review-ev-row" key={a.version}>
                  <Badge>v{a.version}</Badge>
                  <span>{a.reason ?? '再评估'}</span>
                  <span className="v2-mono v2-muted">{a.currentScope.map(reachName).join(' → ') || '—'}</span>
                </div>
              ))}
            </section>
          </div>
        </Panel>

        <Panel code="06" title="复盘结论" en="CONCLUSION" className="v2-review-section">
          <ReviewConclusionBlock dossier={dossier} />
        </Panel>

        <p className="v2-review-footnote v2-muted v2-no-print">
          数据来源：事件状态机、统一业务时间线、现场巡检提交与复核、恢复评估规则窗口。评估结论只读，不改变事件状态。
        </p>
      </div>
    </div>
  );
}

function EvidenceList({
  title,
  en,
  items,
  tone,
}: {
  title: string;
  en: string;
  items: { id: string; type: string; note: string | null; sourceRef: string; by: string; at: string | null }[];
  tone: 'live' | 'high';
}) {
  return (
    <section className="v2-review-subblock">
      <header><h4>{title}</h4><span>{en}</span><Badge>{items.length}</Badge></header>
      {items.length === 0 ? <p className="v2-report-empty">暂无</p> : items.map((item) => (
        <div className="v2-review-ev-row" key={item.id}>
          <Badge tone={tone}>{EVIDENCE_TYPE_CN[item.type] ?? item.type}</Badge>
          <span>{item.note ?? item.sourceRef}</span>
          <span className="v2-mono v2-muted">{item.by}{item.at ? ` · ${displayIso(item.at)}` : ''}</span>
        </div>
      ))}
    </section>
  );
}

function FieldTask({ task }: { task: ReviewTaskRecord }) {
  return (
    <section className="v2-field-task">
      <header className="v2-field-task__head">
        <Badge tone={task.status === 'APPROVED' ? 'live' : 'mid'}>{task.status}</Badge>
        <b>{task.title}</b>
        <span className="v2-mono v2-muted">{reachName(task.reachId)} · {task.submissions.length} 次提交 · {task.reviews.length} 次复核</span>
      </header>
      {task.submissions.length === 0 ? (
        <p className="v2-report-empty">该任务暂无提交版本</p>
      ) : (
        [...task.submissions].reverse().map((submission) => (
          <FieldSubmission
            key={submission.submissionId}
            submission={submission}
            reviews={task.reviews.filter((r) => r.version === submission.version)}
          />
        ))
      )}
    </section>
  );
}

function FieldSubmission({ submission, reviews }: { submission: TaskSubmission; reviews: TaskReviewRecord[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`v2-submission ${submission.supersededAt ? 'is-superseded' : ''}`}>
      <button type="button" className="v2-submission__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="v2-row" style={{ gap: 8 }}>
          <b className="v2-mono">v{submission.version}</b>
          <Badge tone={submission.conclusion === 'NORMAL' ? 'live' : submission.conclusion === 'ABNORMAL' ? 'high' : 'default'}>
            {submission.conclusion === 'NORMAL' ? '未见明显异常' : submission.conclusion === 'ABNORMAL' ? '发现异常' : '无法确认'}
          </Badge>
          {submission.supersededAt && <Badge tone="mid">已退回归档</Badge>}
        </span>
        <span className="v2-mono v2-muted">
          {submission.submittedBy} · {formatTime(submission.submittedAt)} · {submission.attachmentIds.length} 张照片 {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="v2-submission__body">
          <p>{submission.observationNote || '（无现场记录）'}</p>
          <span className="v2-mono v2-muted">观测时间：{formatTime(submission.observedAt)}</span>
          <div className="v2-report-photos">
            {submission.attachmentIds.length === 0 ? <span className="v2-muted">本版本无照片</span> : submission.attachmentIds.map((id) => (
              <a key={id} href={api.attachmentUrl(id)} target="_blank" rel="noreferrer" className="v2-report-photo">
                <img src={api.attachmentUrl(id)} alt={`v${submission.version} 现场照片`} loading="lazy" />
                <span className="v2-mono">{id.slice(0, 10)}…</span>
              </a>
            ))}
          </div>
          {reviews.length > 0 ? reviews.map((r) => (
            <div className="v2-review-line" key={r.reviewId}>
              <Badge tone={r.decision === 'APPROVED' ? 'live' : 'high'}>{r.decision === 'APPROVED' ? '复核通过' : '退回补充'}</Badge>
              <span>{r.comment || '（无意见）'}</span>
              <span className="v2-mono v2-muted">{r.reviewer} · {formatTime(r.reviewedAt)}</span>
            </div>
          )) : <p className="v2-muted">本版本暂无复核记录</p>}
        </div>
      )}
    </div>
  );
}
