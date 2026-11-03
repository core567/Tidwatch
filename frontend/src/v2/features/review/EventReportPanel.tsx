import { EVENT_STATUS, reachName } from '@/components/EventBits';
import { api } from '@/services/apiClient';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { PanelState } from '../../components/ui/PanelState';
import type { EventDetail, EventReviewDetail, RecoveryAssessment } from '@/types/contract';
import type { useEventDossier } from './useEventDossier';
import { RecoveryCard } from './RecoveryCard';
import { ReviewTrendChart } from './ReviewTrendChart';
import { RiskRail } from './RiskRail';
import {
  EVIDENCE_TYPE_CN,
  buildDisposalActions,
  buildRiskPoints,
  clockRange,
  collectAttachments,
  durationText,
  metricLabel,
  metricUnit,
  peakInWindow,
  priorityMetaSafe,
  statusTone,
  summaryText,
} from './reviewModel';

type DossierView = ReturnType<typeof useEventDossier>;

/* ---------------- 报告头部 ---------------- */

export function ReviewReportHead({
  event,
  review,
  assess,
}: {
  event: EventDetail;
  review: EventReviewDetail;
  assess: RecoveryAssessment | undefined;
}) {
  const priority = priorityMetaSafe(event.priority);
  const status = EVENT_STATUS[event.status]?.text ?? event.status;
  const scope = event.scopeReachIds.map(reachName).join(' → ') || '—';
  return (
    <header className="v2-report-head">
      <div className="v2-report-head__meta">
        <Badge tone={priority.badge}>{priority.code} · {priority.label}</Badge>
        <Badge tone={statusTone(event.status)}>{status}</Badge>
        <span className="v2-mono">{event.eventId}</span>
        <span className="v2-mono">v{event.version}</span>
        {review.tasks.length > 0 && <span className="v2-mono">关联任务 {review.tasks.length}</span>}
      </div>
      <h3 className="v2-report-title">{event.title}</h3>
      <p className="v2-report-summary">{summaryText(event, review)}</p>
      <div className="v2-report-head__sub">
        <span>{scope}</span>
        <span>·</span>
        <span className="v2-mono">
          {clockRange(event.firstSeenAt, assess?.anchor.at ?? event.updatedAt)}
        </span>
        <span>·</span>
        <span>{event.eventType}</span>
      </div>
    </header>
  );
}

/* ---------------- 指标卡 ---------------- */

export function ReviewStatGrid({
  event,
  review,
  assess,
  peak,
  unit,
}: {
  event: EventDetail;
  review: EventReviewDetail;
  assess: RecoveryAssessment | undefined;
  peak: number | null;
  unit: string;
}) {
  const submissions = review.tasks.reduce((sum, t) => sum + t.submissions.length, 0);
  return (
    <div className="v2-report-stats">
      <div>
        <span>触发指标</span>
        <b className="v2-report-stats__text">{metricLabel(event.trigger?.metric)}</b>
        <em>{event.trigger?.direction === 'DOWN' ? '下降' : event.trigger?.direction === 'LEVEL' ? '偏离' : '上升'}</em>
      </div>
      <div>
        <span>异常峰值</span>
        <b className="v2-mono">{peak === null ? '—' : Number.isInteger(peak) ? peak : peak.toFixed(2)}</b>
        <em>{unit || '—'}</em>
      </div>
      <div>
        <span>事件至锚点</span>
        <b className="v2-mono v2-report-stats__text">{durationText(assess, event)}</b>
        <em>首发→复核</em>
      </div>
      <div>
        <span>现场任务</span>
        <b className="v2-mono">{String(review.tasks.length).padStart(2, '0')}</b>
        <em>{submissions} 次提交</em>
      </div>
    </div>
  );
}

/* ---------------- 趋势 + 恢复 / 风险 ---------------- */

export function ReviewAnalysisGrid({ dossier }: { dossier: DossierView }) {
  const { event, assess, chartWindow, observations, observationsLoading } = dossier;
  const tone = priorityMetaSafe(event?.priority).tone;
  const unit = metricUnit(chartWindow, observations);
  const baseline = chartWindow?.baseline ?? null;
  const thresholdText = chartWindow?.threshold === null || chartWindow?.threshold === undefined
    ? null
    : Array.isArray(chartWindow.threshold)
      ? chartWindow.threshold.join(' / ')
      : String(chartWindow.threshold);
  return (
    <div className="v2-report-grid">
      <section className="v2-report-block v2-report-block--chart">
        <header className="v2-report-block__head">
          <h4>异常前后数据对比</h4>
          <span>BEFORE / AFTER</span>
          <span className="v2-report-block__aside v2-mono">
            {metricLabel(event?.trigger?.metric)} · 真实观测
          </span>
        </header>
        <div className="v2-report-chart-legend">
          <span><i style={{ background: tone === 'high' ? '#ff6f5e' : tone === 'medium' ? '#ffc46b' : '#4fe6d2' }} />实测值</span>
          <span><i className="is-dotted" />基线 {baseline ?? '—'}</span>
          {thresholdText && <span><i className="is-dashed" />阈值 {thresholdText}</span>}
          <span className="v2-mono">EVENT WINDOW</span>
        </div>
        <ReviewTrendChart
          observations={observations}
          window={chartWindow}
          unit={unit}
          tone={tone}
          loading={observationsLoading}
        />
      </section>

      <aside className="v2-report-side">
        <RecoveryCard assess={assess} />
        <section className="v2-report-block">
          <header className="v2-report-block__head">
            <h4>风险变化</h4>
            <span>RISK EVOLUTION</span>
          </header>
          <RiskRail
            points={buildRiskPoints(
              event?.transitions ?? [],
              event?.status,
              event?.updatedAt,
            )}
          />
        </section>
      </aside>
    </div>
  );
}

/* ---------------- 处置过程 ---------------- */

export function ReviewDisposalBlock({ dossier }: { dossier: DossierView }) {
  const actions = buildDisposalActions(dossier.timeline);
  return (
    <section className="v2-report-block">
      <header className="v2-report-block__head">
        <h4>处置过程</h4>
        <span>DISPOSAL PROCESS</span>
        <span className="v2-report-block__aside v2-mono">{actions.length} 条业务动作</span>
      </header>
      {actions.length === 0 ? (
        <p className="v2-report-empty">暂无处置动作记录</p>
      ) : (
        <ol className="v2-report-actions">
          {actions.map((action) => (
            <li key={action.key}>
              <span className="v2-report-actions__time v2-mono">{action.time}</span>
              <span className="v2-report-actions__dot" />
              <div>
                <b>{action.action}</b>
                <p>
                  {action.actor}
                  {action.note ? ` · ${action.note}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------------- 证据与照片 ---------------- */

export function ReviewEvidenceBlock({ review }: { review: EventReviewDetail }) {
  const photos = collectAttachments(review);
  const evidence = [...review.supportingEvidence, ...review.counterEvidence];
  return (
    <section className="v2-report-block">
      <header className="v2-report-block__head">
        <h4>证据与现场记录</h4>
        <span>EVIDENCE</span>
        <span className="v2-report-block__aside v2-mono">
          {evidence.length} 条证据 · {photos.length} 张照片
        </span>
      </header>
      {evidence.length === 0 ? (
        <p className="v2-report-empty">暂无证据记录</p>
      ) : (
        <div className="v2-report-evidence-list">
          {evidence.map((item) => (
            <div className="v2-report-evidence" key={`${item.polarity}-${item.id}`}>
              <span className={`v2-report-evidence__type v2-report-evidence__type--${item.type.toLowerCase()}`}>
                <Icon name={item.type === 'OBSERVATION' ? 'wave' : item.type === 'MANUAL' ? 'inspection' : 'layers'} size={13} />
              </span>
              <div className="v2-report-evidence__main">
                <b title={item.note ?? item.sourceRef}>{item.note ?? item.sourceRef}</b>
                <p>{EVIDENCE_TYPE_CN[item.type] ?? item.type} · {item.sourceRef}</p>
              </div>
              <span className={`v2-report-evidence__polarity v2-report-evidence__polarity--${item.polarity === 'SUPPORT' ? 'support' : 'counter'}`}>
                {item.polarity === 'SUPPORT' ? '支持' : '反证'}
              </span>
            </div>
          ))}
        </div>
      )}
      {photos.length === 0 ? (
        <p className="v2-report-empty">本事件暂无现场照片附件</p>
      ) : (
        <div className="v2-report-photos">
          {photos.map((photo) => (
            <a key={photo.id} href={api.attachmentUrl(photo.id)} target="_blank" rel="noreferrer" className="v2-report-photo">
              <img src={api.attachmentUrl(photo.id)} alt={`${photo.taskTitle} 第 ${photo.version} 版现场照片`} loading="lazy" />
              <span className="v2-mono">v{photo.version} · {photo.id.slice(0, 8)}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- 结论 ---------------- */

export function ReviewConclusionBlock({ dossier }: { dossier: DossierView }) {
  const { event, review, assess, recommendations } = dossier;
  if (!review || !event) return null;
  const status = EVENT_STATUS[event.status]?.text ?? event.status;
  return (
    <section className="v2-report-conclusion">
      <header className="v2-report-block__head">
        <h4>复盘结论与遗留问题</h4>
        <span>CONCLUSION</span>
      </header>
      <p className="v2-report-conclusion__lead">
        当前业务状态「{status}」{assess ? `，规则恢复评估结论「${assess.label}」` : ''}。以下内容来自真实复盘记录，不补写推断性成因。
      </p>
      <div className="v2-report-conclusion__grid">
        <div>
          <span className="v2-report-conclusion__label">未解决问题（{review.unresolved.length}）</span>
          {review.unresolved.length === 0 ? (
            <p className="v2-report-empty">无</p>
          ) : (
            <ul className="v2-report-unresolved">
              {review.unresolved.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          )}
        </div>
        <div>
          <span className="v2-report-conclusion__label">研判假设（{review.hypotheses.length}）</span>
          {review.hypotheses.length === 0 ? (
            <p className="v2-report-empty">暂无研判假设</p>
          ) : (
            <ul className="v2-report-hypotheses">
              {review.hypotheses.map((h) => (
                <li key={h.id}>
                  <b>{h.statement}</b>
                  <span className="v2-mono">{h.state} · 支持 {h.support} / 反证 {h.counter}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="v2-report-conclusion__recs">
        <span className="v2-report-conclusion__label">规则建议（{recommendations.length}）</span>
        {recommendations.length === 0 ? (
          <p className="v2-report-empty">当前无规则处置建议</p>
        ) : (
          <div className="v2-report-recommendations">
            {recommendations.map((item, index) => (
              <span key={`${item.code}-${index}`} title={item.reason}>
                <i className="v2-mono">{String(index + 1).padStart(2, '0')}</i>
                {item.title}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="v2-report-disclaimer">{review.disclaimer}</p>
    </section>
  );
}

/* ---------------- 右栏完整报告 ---------------- */

export function EventReportPanel({
  dossier,
  onOpenDetail,
  onOpenReport,
}: {
  dossier: DossierView;
  onOpenDetail?: () => void;
  onOpenReport: () => void;
}) {
  const { event, review, assess, chartWindow, observations, loading, error } = dossier;
  const peak = peakInWindow(observations, chartWindow);
  const unit = metricUnit(chartWindow, observations);

  const actions = (
    <>
      {onOpenDetail && (
        <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={onOpenDetail}>
          完整复盘 <Icon name="arrow-right" size={11} />
        </button>
      )}
      <button type="button" className="v2-btn v2-btn--primary v2-btn--sm" onClick={onOpenReport}>
        <Icon name="download" size={12} />导出完整报告
      </button>
    </>
  );

  if (loading && !review) {
    return (
      <Panel code="02" title="事件复盘报告" en="INCIDENT REPORT" className="v2-report-panel">
        <div className="v2-state-page"><PanelState variant="loading" title="复盘数据加载中…" /></div>
      </Panel>
    );
  }
  if (error || !event || !review) {
    return (
      <Panel code="02" title="事件复盘报告" en="INCIDENT REPORT" className="v2-report-panel">
        <div className="v2-state-page">
          <div className="v2-state__title">复盘数据加载失败</div>
          <p className="v2-muted">{error ? (error as Error).message : '未找到事件复盘记录'}</p>
          <button type="button" className="v2-btn v2-btn--primary" onClick={() => dossier.refetch()}>重新加载</button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      code="02"
      title="事件复盘报告"
      en="INCIDENT REPORT"
      className="v2-report-panel"
      actions={actions}
    >
      <ReviewReportHead event={event} review={review} assess={assess} />
      <ReviewStatGrid event={event} review={review} assess={assess} peak={peak} unit={unit} />
      <ReviewAnalysisGrid dossier={dossier} />
      <div className="v2-report-grid v2-report-grid--even">
        <ReviewDisposalBlock dossier={dossier} />
        <ReviewEvidenceBlock review={review} />
      </div>
      <ReviewConclusionBlock dossier={dossier} />
    </Panel>
  );
}
