import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import ObservationCompare from '@/components/ObservationCompare';
import { Button, Card, EmptyState, PageHeader, Tag, Tabs } from '@/components/ui';
import BusinessTimeline from '@/components/BusinessTimeline';
import { EventStatusBadge, formatTime, reachName } from '@/components/EventBits';
import { RECOVERY_FACTOR_CN } from '@/lib/recoveryFactorCn';
import ReviewReport from './ReviewReport';
import type {
  EventReviewDetail,
  RecoveryAssessment,
  TaskReviewRecord,
  TaskSubmission,
} from '@/types/contract';
import './event-review.css';

const TAB_ITEMS = [
  { key: 'overview', label: '复盘总览' },
  { key: 'timeline', label: '统一时间线' },
  { key: 'field', label: '现场处置' },
  { key: 'evidence', label: '证据与评估' },
];

const CONCLUSION_CN: Record<string, string> = { NORMAL: '正常', ABNORMAL: '异常', UNCERTAIN: '无法确认' };
const FACTOR_CN: Record<string, string> = Object.fromEntries(
  Object.entries(RECOVERY_FACTOR_CN).map(([k, v]) => [k, v.name]),
);

export default function EventReviewPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [printing, setPrinting] = useState(false);

  const eventQ = useQuery({ queryKey: ['event', eventId], queryFn: () => api.event(eventId) });
  const reviewQ = useQuery({ queryKey: ['review-detail', eventId], queryFn: () => api.eventReviewDetail(eventId) });
  const assessQ = useQuery({ queryKey: ['recovery', eventId], queryFn: () => api.recoveryAssessment(eventId) });

  // 打印结束（含取消）后退出报告模式
  useEffect(() => {
    if (!printing) return;
    const onAfter = () => setPrinting(false);
    window.addEventListener('afterprint', onAfter);
    return () => window.removeEventListener('afterprint', onAfter);
  }, [printing]);

  const startPrint = () => {
    setPrinting(true);
    // 等待报告 DOM 渲染后唤起打印
    setTimeout(() => window.print(), 120);
  };

  if (eventQ.isLoading || reviewQ.isLoading) return <div className="state-box">复盘数据加载中…</div>;
  if (eventQ.isError || reviewQ.isError)
    return (
      <div className="state-box">
        复盘加载失败：{(eventQ.error as Error)?.message || (reviewQ.error as Error)?.message}
        <Button size="sm" onClick={() => navigate('/review')}>返回列表</Button>
      </div>
    );

  const event = eventQ.data!;
  const review = reviewQ.data!;
  const assess = assessQ.data;
  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });

  if (printing) {
    return (
      <ReviewReport eventId={eventId} review={review} assessment={assess} now={nowStr} />
    );
  }

  return (
    <div className="tw-stack">
      <PageHeader
        code={`复盘 · ${event.eventId}`}
        title={event.title}
        badges={
          <>
            <EventStatusBadge status={event.status} />
            <Tag tone={event.priority === 'HIGH' ? 'danger' : 'muted'}>
              {event.priority === 'HIGH' ? '高优先级' : event.priority === 'LOW' ? '低' : '普通'}
            </Tag>
            <Tag tone="outline">规则 {event.ruleVersion}</Tag>
          </>
        }
        description={`事件类型 ${event.eventType} · 涉及 ${event.scopeReachIds.map(reachName).join(' → ') || '—'}`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate('/review')}>← 复盘列表</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(`/events/${eventId}/workbench`)}>研判工作台</Button>
            <Button size="sm" onClick={startPrint}>🖨 打印 / 导出 PDF</Button>
          </>
        }
      />

      <RecoveryBanner assess={assess} loading={assessQ.isLoading} />

      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab review={review} assessment={assess} eventId={eventId} />}
      {tab === 'timeline' && (
        <Card title="统一时间线" subtitle="事件迁移 / 任务派发 / 现场提交 / 复核 / 证据 / 盲区（business_events）">
          <BusinessTimeline eventId={eventId} />
        </Card>
      )}
      {tab === 'field' && <FieldTab review={review} />}
      {tab === 'evidence' && <EvidenceTab review={review} />}

      <div className="tw-small tw-muted">
        数据来源：MQTT 模拟观测、官方实时快照、现场人工记录与规则建议；评估结论只读、不改变事件状态。
      </div>
    </div>
  );
}

/** 恢复评估横幅：业务状态 / 观测事实 / 规则评估三层分离。 */
function RecoveryBanner({ assess, loading }: { assess?: RecoveryAssessment; loading: boolean }) {
  if (loading) return <Card title="恢复评估"><div className="tw-tiny">评估加载中…</div></Card>;
  if (!assess) return null;
  const tone = assess.result === 'RECOVERED_SUPPORTED' ? 'ok'
    : assess.result === 'NEEDS_OBSERVATION' ? 'watch' : 'muted';
  return (
    <Card title="恢复评估（规则）" subtitle={`${assess.ruleVersion} · 评估时间 ${formatTime(assess.evaluatedAt)}`}
      actions={<Tag tone={tone as 'ok' | 'watch' | 'muted'}>{assess.label}</Tag>}>
      <div className="tw-recover-grid">
        <div className="tw-recover-cell">
          <div className="tw-recover-k">事件业务状态</div>
          <div><EventStatusBadge status={assess.currentStatus} /></div>
          <div className="tw-tiny">由状态机人工操作控制，评估不自动改状态</div>
        </div>
        <div className="tw-recover-cell">
          <div className="tw-recover-k">时间锚点</div>
          <div className="tw-small">{assess.anchor.at ? formatTime(assess.anchor.at) : '锚点缺失'}</div>
          <div className="tw-tiny">{assess.anchor.note}</div>
        </div>
        <div className="tw-recover-cell">
          <div className="tw-recover-k">规则评估</div>
          <div className="tw-small tw-recover-conclusion">{assess.label}</div>
        </div>
      </div>
      <div className="tw-factor-list">
        {assess.factors.map((f) => (
          <div key={f.code} className="tw-factor">
            <span className={`tw-factor-dot ${f.passed === true ? 'is-ok' : f.passed === false ? 'is-danger' : 'is-muted'}`} />
            <div>
              <b>{FACTOR_CN[f.code] ?? f.code}</b>
              <span className="tw-factor-code">{f.code}</span>
              <span className={`tw-factor-state ${f.passed === true ? 'ok' : f.passed === false ? 'danger' : 'muted'}`}>
                {f.passed === true ? '通过' : f.passed === false ? '不满足' : '信息不足'}
              </span>
              <div className="tw-tiny">{f.detail}</div>
            </div>
          </div>
        ))}
      </div>
      {assess.result === 'INSUFFICIENT_EVIDENCE' && (
        <div className="tw-recover-warn">证据不足因素：{assess.factors.filter((f) => f.passed !== true).map((f) => f.code).join('、')}</div>
      )}
    </Card>
  );
}

function OverviewTab({
  review,
  assessment,
  eventId,
}: {
  review: EventReviewDetail;
  assessment?: RecoveryAssessment;
  eventId: string;
}) {
  return (
    <div className="tw-stack">
      <ObservationCompare eventId={eventId} assessment={assessment} />
      <div className="tw-rev-overview">
        <Card title="事件概要">
          <Row k="事件编号" v={review.eventId} />
          <Row k="当前状态" v={<EventStatusBadge status={review.status} />} />
          <Row k="优先级" v={review.priority} />
          <Row k="涉及范围" v={review.scope.map(reachName).join(' → ') || '—'} />
          <Row k="首发时间" v={review.firstSeenAt ? formatTime(review.firstSeenAt) : '—'} />
          <Row k="最近更新" v={review.updatedAt ? formatTime(review.updatedAt) : '—'} />
        </Card>
        <Card title="范围演化（版本）" subtitle="范围收窄/扩展均留版本">
          {review.scopeHistory.length === 0 ? (
            <EmptyState title="无范围版本" />
          ) : (
            review.scopeHistory.map((s) => (
              <div key={s.version} className="tw-scope-row">
                <Tag tone="outline">v{s.version}</Tag>
                <b>{s.reaches.map(reachName).join(' → ') || '—'}</b>
                {s.reason && <span className="tw-tiny"> {s.reason}</span>}
              </div>
            ))
          )}
        </Card>
        <Card title="现场处置概览">
          {review.tasks.length === 0 ? (
            <EmptyState title="暂无关联巡检任务" description="研判工作台派发任务后在此汇总。" />
          ) : (
            review.tasks.map((t) => (
              <div key={t.id} className="tw-scope-row">
                <Tag tone={t.status === 'APPROVED' ? 'ok' : t.status === 'CANCELLED' ? 'muted' : 'watch'}>{t.status}</Tag>
                <span>{t.title}</span>
                <span className="tw-tiny">{reachName(t.reachId)} · {t.submissions.length} 次提交 · {t.reviews.length} 次复核</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

function FieldTab({ review }: { review: EventReviewDetail }) {
  if (review.tasks.length === 0)
    return <Card title="现场处置"><EmptyState title="暂无现场处置记录" description="没有关联的巡检任务与提交版本。" /></Card>;
  return (
    <div className="tw-stack">
      {review.tasks.map((t) => (
        <Card
          key={t.id}
          title={t.title}
          subtitle={`${t.id} · ${reachName(t.reachId)} · ${t.status}`}
          actions={<Tag tone={t.status === 'APPROVED' ? 'ok' : t.status === 'CANCELLED' ? 'muted' : 'watch'}>{t.status}</Tag>}
        >
          {t.submissions.length === 0 ? (
            <div className="tw-tiny">该任务尚无现场提交版本。</div>
          ) : (
            [...t.submissions].reverse().map((s) => (
              <SubmissionBlock key={s.submissionId} submission={s} reviews={t.reviews.filter((r) => r.version === s.version)} />
            ))
          )}
        </Card>
      ))}
    </div>
  );
}

function SubmissionBlock({ submission: s, reviews }: { submission: TaskSubmission; reviews: TaskReviewRecord[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`tw-submission ${s.supersededAt ? 'is-superseded' : ''}`}>
      <div className="tw-row-between" onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>
        <div className="tw-row" style={{ gap: 8 }}>
          <b>v{s.version}</b>
          <Tag tone={s.conclusion === 'NORMAL' ? 'ok' : s.conclusion === 'ABNORMAL' ? 'danger' : 'watch'}>
            {CONCLUSION_CN[s.conclusion] ?? s.conclusion}
          </Tag>
          {s.supersededAt && <Tag tone="muted">已退回归档</Tag>}
        </div>
        <span className="tw-tiny">{s.submittedBy} · {formatTime(s.submittedAt)} · {s.attachmentIds.length} 张照片 {open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="tw-submission-body">
          <div className="tw-small">{s.observationNote || '（无现场记录）'}</div>
          <div className="tw-tiny">现场观测时间：{formatTime(s.observedAt)}</div>
          <div className="tw-photos">
            {s.attachmentIds.length === 0 ? (
              <span className="tw-tiny">本版本无照片</span>
            ) : (
              s.attachmentIds.map((aid) => (
                <a key={aid} href={api.attachmentUrl(aid)} target="_blank" rel="noreferrer" className="tw-photo-chip">
                  📷 {aid.slice(0, 14)}…
                </a>
              ))
            )}
          </div>
          {reviews.length > 0 ? (
            reviews.map((r) => (
              <div key={r.reviewId} className="tw-review-line">
                <Tag tone={r.decision === 'APPROVED' ? 'ok' : 'danger'}>
                  {r.decision === 'APPROVED' ? '复核通过' : '退回补充'}
                </Tag>
                <span className="tw-small">{r.comment || '（无意见）'}</span>
                <span className="tw-tiny">{r.reviewer} · {formatTime(r.reviewedAt)}</span>
              </div>
            ))
          ) : (
            <div className="tw-tiny">本版本暂无 PC 复核记录。</div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceTab({ review }: { review: EventReviewDetail }) {
  return (
    <div className="tw-rev-overview">
      <Card title={`支持证据（${review.supportingEvidence.length}）`}>
        {review.supportingEvidence.length === 0 ? <EmptyState title="暂无支持证据" /> :
          review.supportingEvidence.map((e) => (
            <div key={e.id} className="tw-ev-row"><Tag tone="ok">{e.type}</Tag><span>{e.note ?? e.sourceRef}</span></div>
          ))}
      </Card>
      <Card title={`反证/缺失（${review.counterEvidence.length}）`}>
        {review.counterEvidence.length === 0 ? <EmptyState title="暂无反证或缺失证据" /> :
          review.counterEvidence.map((e) => (
            <div key={e.id} className="tw-ev-row"><Tag tone="danger">{e.polarity}</Tag><span>{e.note ?? e.sourceRef}</span></div>
          ))}
      </Card>
      <Card title={`假设（${review.hypotheses.length}）`}>
        {review.hypotheses.length === 0 ? <EmptyState title="暂无假设" /> :
          review.hypotheses.map((h) => (
            <div key={h.id} className="tw-ev-row">
              <Tag tone={h.state === 'SUPPORT' ? 'ok' : h.state === 'NOT_SUPPORT' ? 'muted' : 'watch'}>{h.state}</Tag>
              <span>{h.statement}</span>
              <span className="tw-tiny">支持 {h.support} · 反证 {h.counter}</span>
            </div>
          ))}
      </Card>
      <Card title={`再评估（${review.assessments.length}）`}>
        {review.assessments.length === 0 ? <EmptyState title="暂无再评估版本" /> :
          review.assessments.map((a, i) => (
            <div key={i} className="tw-scope-row">
              <Tag tone="outline">v{a.version}</Tag>
              <span className="tw-small">{a.reason || a.trigger || '范围再评估'}</span>
            </div>
          ))}
      </Card>
      <Card title={`监测盲区（${review.blindSpots?.length ?? 0}）`}>
        {(review.blindSpots?.length ?? 0) === 0 ? <EmptyState title="无监测盲区记录" /> :
          review.blindSpots!.map((b, i) => (
            <div key={i} className="tw-ev-row">
              <Tag tone={b.resolved ? 'ok' : 'danger'}>{b.resolved ? '已解除' : '未消除'}</Tag>
              <span>{reachName(b.reachId)} · {b.reason}</span>
            </div>
          ))}
      </Card>
      <Card title={`跨断面时序关系（${review.temporalRelations.length}）`}>
        {review.temporalRelations.length === 0 ? <EmptyState title="无时序关系记录" /> :
          review.temporalRelations.map((t, i) => (
            <div key={i} className="tw-ev-row">
              <span>变化先后相差 <b>{Math.round(t.deltaSeconds / 60)}</b> 分钟</span>
              <span className="tw-tiny">{t.note}（时序先后不构成因果）</span>
            </div>
          ))}
      </Card>
      <Card title={`未解决问题与后续（${review.unresolved.length}）`}>
        {review.unresolved.length === 0 ? <EmptyState title="无未解决项" /> :
          <ul className="tw-unresolved-list">
            {review.unresolved.map((u, i) => <li key={i}>{u}</li>)}
          </ul>}
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="tw-row-between" style={{ padding: '5px 0', fontSize: 13.5 }}>
      <span className="tw-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}
