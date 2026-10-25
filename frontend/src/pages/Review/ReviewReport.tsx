import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { EventStatusBadge, formatTime, reachName } from '@/components/EventBits';
import SourceTag from '@/components/SourceTag';
import { compareRange, splitPhases } from '@/lib/comparePhases';
import { summarizeTimeline } from '@/lib/timelineSummary';
import { RECOVERY_FACTOR_CN } from '@/lib/recoveryFactorCn';
import type {
  EventReviewDetail,
  Observation,
  RecoveryAssessment,
} from '@/types/contract';
import './review-report.css';

const CONCLUSION_CN: Record<string, string> = { NORMAL: '正常', ABNORMAL: '异常', UNCERTAIN: '无法确认' };

/**
 * 正式复盘报告（打印/另存 PDF）。仅在打印模式渲染全部章节，
 * 使用真实数据；缺失内容显式标注，不生成虚构结论。
 */
export default function ReviewReport({
  eventId,
  review,
  assessment,
  now,
}: {
  eventId: string;
  review: EventReviewDetail;
  assessment?: RecoveryAssessment;
  now: string;
}) {
  const scope = review.scope;
  // 报告对比：对每个涉及断面拉取水位（主要触发指标），其余指标在交互页查看
  const compareReach = scope[0] ?? 'reach-a';
  const firstMs = review.firstSeenAt ? Date.parse(review.firstSeenAt) : null;
  const anchorMs = assessment?.anchor.at ? Date.parse(assessment.anchor.at) : null;
  const range = compareRange(firstMs, anchorMs);

  const obsQ = useQuery({
    queryKey: ['report-obs', eventId, compareReach],
    queryFn: () =>
      api.observations(compareReach, {
        metric: 'waterLevel',
        from: range!.start,
        to: range!.end,
        order: 'asc',
        pageSize: 500,
      }),
    enabled: !!range,
  });
  const rows = (obsQ.data?.items ?? []) as Observation[];
  const phases = useMemo(
    () => (firstMs == null ? null : splitPhases(rows, firstMs, anchorMs)),
    [rows, firstMs, anchorMs],
  );

  const summary = buildSummary(review, assessment);

  return (
    <div className="tw-report">
      <header className="tw-report-head">
        <div className="tw-report-brand">TideWatch 智慧河流水环境监测系统</div>
        <h1>异常事件复盘报告</h1>
        <div className="tw-report-meta">
          <span>事件编号：{review.eventId}</span>
          <span>报告生成时间：{now}</span>
        </div>
      </header>

      <Section no={1} title="复盘摘要">
        <p className="tw-report-summary">{summary}</p>
      </Section>

      <Section no={2} title="事件概要">
        <table className="tw-kv-table">
          <tbody>
            <KV k="事件标题" v={review.title} />
            <KV k="事件类型" v={review.eventType} />
            <KV k="业务状态" v={<EventStatusBadge status={review.status} />} />
            <KV k="优先级" v={review.priority} />
            <KV k="涉及范围" v={scope.map(reachName).join(' → ') || '—'} />
            <KV k="首发时间" v={review.firstSeenAt ? formatTime(review.firstSeenAt) : '—'} />
            <KV k="最近更新" v={review.updatedAt ? formatTime(review.updatedAt) : '—'} />
            <KV k="规则版本" v={review.ruleVersion} />
          </tbody>
        </table>
        {review.scopeHistory.length > 0 && (
          <>
            <h4>范围演化</h4>
            <table className="tw-data-table">
              <thead><tr><th>版本</th><th>范围</th><th>原因</th></tr></thead>
              <tbody>
                {review.scopeHistory.map((s) => (
                  <tr key={s.version}>
                    <td>v{s.version}</td>
                    <td>{s.reaches.map(reachName).join(' → ') || '—'}</td>
                    <td>{s.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      <Section no={3} title="业务时间线">
        <ReportTimeline eventId={eventId} />
      </Section>

      <Section no={4} title="任务与现场处置">
        {review.tasks.length === 0 ? (
          <Missing>本事件无关联巡检任务，暂无现场处置记录。</Missing>
        ) : (
          review.tasks.map((t) => (
            <div key={t.id} className="tw-report-task">
              <h4>
                {t.title}
                <span className="tw-report-muted">（{t.id} · {reachName(t.reachId)} · 状态 {t.status}）</span>
              </h4>
              {t.submissions.length === 0 ? (
                <Missing>该任务尚无现场提交版本。</Missing>
              ) : (
                <table className="tw-data-table">
                  <thead>
                    <tr><th>版本</th><th>提交时间/人</th><th>现场记录</th><th>结论</th><th>照片</th><th>复核</th></tr>
                  </thead>
                  <tbody>
                    {[...t.submissions].reverse().map((s) => {
                      const rv = t.reviews.filter((r) => r.version === s.version);
                      return (
                        <tr key={s.submissionId} className={s.supersededAt ? 'is-superseded' : ''}>
                          <td>v{s.version}{s.supersededAt ? '（已退回）' : ''}</td>
                          <td>{formatTime(s.submittedAt)}<br /><span className="tw-report-muted">{s.submittedBy}</span></td>
                          <td>{s.observationNote || '—'}</td>
                          <td>{CONCLUSION_CN[s.conclusion] ?? s.conclusion}</td>
                          <td>{s.attachmentIds.length ? `${s.attachmentIds.length} 张（ID：${s.attachmentIds.join('、')}）` : '无'}</td>
                          <td>
                            {rv.length === 0
                              ? <Missing inline>无复核</Missing>
                              : rv.map((r) => (
                                  <div key={r.reviewId}>
                                    {r.decision === 'APPROVED' ? '复核通过' : '退回补充'}：{r.comment || '（无意见）'}
                                    <span className="tw-report-muted">（{r.reviewer} · {formatTime(r.reviewedAt)}）</span>
                                  </div>
                                ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))
        )}
      </Section>

      <Section no={5} title="处置前后三段观测对比">
        <div className="tw-report-muted" style={{ marginBottom: 8 }}>
          断面 {reachName(compareReach)} · 水位 · <SourceTag source="SIMULATED" />
        </div>
        {!assessment?.anchor.at ? (
          <Missing>处置后时间锚点缺失：无 APPROVED 复核时间，也无恢复相关状态迁移，不生成处置前后结论。</Missing>
        ) : (
          <div className="tw-report-muted" style={{ marginBottom: 8 }}>
            时间锚点：{formatTime(assessment.anchor.at)}（{assessment.anchor.note}）
          </div>
        )}
        {!phases ? (
          <Missing>缺少事件首现时间，无法构建观测窗口。</Missing>
        ) : (
          <table className="tw-data-table">
            <thead><tr><th>阶段</th><th>起止</th><th>有效样本</th><th>中位数(m)</th></tr></thead>
            <tbody>
              {(['BASELINE', 'ANOMALY', 'POST'] as const).map((p) => {
                const s = phases[p];
                const name = { BASELINE: '异常前基线', ANOMALY: '异常期间', POST: '处置后' }[p];
                return (
                  <tr key={p}>
                    <td>{name}</td>
                    <td>{s.start && s.end ? `${formatTime(s.start)} ~ ${formatTime(s.end)}` : '—'}</td>
                    <td>{s.count}</td>
                    <td>{s.median == null ? <Missing inline>数据不足</Missing> : s.median.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="tw-report-note">本表只描述实际观测变化（事实层），不作为是否恢复的结论。</p>
      </Section>

      <Section no={6} title="恢复评估（规则）">
        <div className="tw-report-assess">
          <span>评估结论：<b>{assessment?.label ?? '—'}</b></span>
          <span className="tw-report-muted">
            业务状态：<EventStatusBadge status={review.status} />（由状态机人工操作控制）
          </span>
        </div>
        {assessment ? (
          <table className="tw-data-table">
            <thead><tr><th>因子</th><th>判定</th><th>依据</th></tr></thead>
            <tbody>
              {assessment.factors.map((f) => (
                <tr key={f.code}>
                  <td>{RECOVERY_FACTOR_CN[f.code]?.name ?? f.code}<div className="tw-report-muted">{f.code}</div></td>
                  <td>{f.passed === true ? '通过' : f.passed === false ? '不满足' : '信息不足'}</td>
                  <td>{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Missing>恢复评估暂不可用。</Missing>
        )}
        <p className="tw-report-note">
          评估为规则只读输出（{assessment?.ruleVersion ?? '—'}），不改变事件状态；即使业务状态为 RECOVERED，
          若证据不足仍判“证据不足、无法判断”。
        </p>
      </Section>

      <Section no={7} title="异常证据与评估记录">
        <h4>支持证据（{review.supportingEvidence.length}）</h4>
        {review.supportingEvidence.length === 0 ? <Missing>无</Missing> : (
          <ul className="tw-report-list">
            {review.supportingEvidence.map((e) => (
              <li key={e.id}>[{e.type}] {e.note ?? e.sourceRef}</li>
            ))}
          </ul>
        )}
        <h4>反证/缺失（{review.counterEvidence.length}）</h4>
        {review.counterEvidence.length === 0 ? <Missing>无</Missing> : (
          <ul className="tw-report-list">
            {review.counterEvidence.map((e) => (
              <li key={e.id}>[{e.polarity}] {e.note ?? e.sourceRef}</li>
            ))}
          </ul>
        )}
        <h4>监测盲区（{review.blindSpots?.length ?? 0}）</h4>
        {(review.blindSpots?.length ?? 0) === 0 ? <Missing>无盲区记录</Missing> : (
          <ul className="tw-report-list">
            {review.blindSpots!.map((b, i) => (
              <li key={i}>{reachName(b.reachId)} · {b.reason} · {b.resolved ? '已解除' : '未消除'}</li>
            ))}
          </ul>
        )}
        <h4>跨断面时序关系（{review.temporalRelations.length}）</h4>
        {review.temporalRelations.length === 0 ? <Missing>无时序关系</Missing> : (
          <ul className="tw-report-list">
            {review.temporalRelations.map((t, i) => (
              <li key={i}>变化先后相差 {Math.round(t.deltaSeconds / 60)} 分钟（{t.note}）</li>
            ))}
          </ul>
        )}
        <h4>未解决问题与后续（{review.unresolved.length}）</h4>
        {review.unresolved.length === 0 ? <Missing>无未解决项</Missing> : (
          <ul className="tw-report-list">
            {review.unresolved.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        )}
      </Section>

      <footer className="tw-report-foot">
        <div>
          数据来源：官方自动站实时快照（OFFICIAL_AUTO，每日快照）、MQTT 模拟观测（SIMULATED）、
          现场人工记录（MANUAL）、规则建议（RULE）。模拟数据与官方数据物理隔离，均显式标注来源。
        </div>
        <div>
          数据口径：仅统计 GOOD 质量观测；中位数按对应时间窗聚合；时间锚点优先取人工复核通过时间。
          本报告不构成法定结论，时序先后不代表因果。生成时间：{now}。
        </div>
      </footer>
    </div>
  );
}

function buildSummary(review: EventReviewDetail, assess?: RecoveryAssessment): string {
  const parts: string[] = [];
  parts.push(`事件“${review.title}”当前业务状态为 ${review.status}，涉及 ${review.scope.map(reachName).join('、') || '—'}。`);
  const tasks = review.tasks.length;
  const subs = review.taskSubmissions.length;
  const approved = review.taskReviews.some((r) => r.decision === 'APPROVED');
  parts.push(
    tasks === 0
      ? '尚未派发现场巡检任务。'
      : `关联 ${tasks} 个任务、${subs} 次现场提交${approved ? '，已有复核通过记录' : '，尚无复核通过记录'}。`,
  );
  parts.push(
    assess
      ? `规则恢复评估结论为“${assess.label}”（与业务状态相互独立，不构成处置有效的证明）。`
      : '暂无恢复评估结果。',
  );
  return parts.join('');
}

function Section({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="tw-report-section">
      <h2><span className="tw-report-no">{no}</span>{title}</h2>
      {children}
    </section>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <tr><td className="tw-kv-k">{k}</td><td>{v}</td></tr>;
}
function Missing({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return <span className={inline ? 'tw-report-missing-inline' : 'tw-report-missing'}>— {children}</span>;
}

/** 报告内嵌的关键时间线（精简：关键节点逐条、重复盲区统计汇总）。 */
function ReportTimeline({ eventId }: { eventId: string }) {
  const q = useQuery({ queryKey: ['event-timeline-report', eventId], queryFn: () => api.eventTimeline(eventId) });
  if (q.isLoading) return <span className="tw-report-muted">时间线加载中…</span>;
  const items = q.data?.items ?? [];
  if (items.length === 0) return <Missing>暂无时间线记录。</Missing>;
  const { key, aggregated } = summarizeTimeline(items);
  return (
    <div>
      <ol className="tw-report-timeline">
        {key.map((k, i) => (
          <li key={`${k.at}-${i}`}>
            <span className="tw-report-muted">{formatTime(k.at)} · {k.actor}</span>
            <div>{k.text}</div>
          </li>
        ))}
      </ol>
      {aggregated.length > 0 && (
        <ul className="tw-report-agg">
          {aggregated.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
    </div>
  );
}
