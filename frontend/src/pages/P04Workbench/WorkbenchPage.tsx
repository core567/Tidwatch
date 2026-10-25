import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Button, Card, EmptyState, PageHeader, Tag } from '@/components/ui';
import BusinessTimeline from '@/components/BusinessTimeline';
import RecommendationsCard from '@/components/RecommendationsCard';
import DisposalPipeline from '@/components/DisposalPipeline';
import { disposalStage, latestOpenTask } from '@/lib/disposalStage';
import { EventStatusBadge, reachName, formatTime } from '@/components/EventBits';
import { simMetricName, simMetricUnitByKey } from '@/lib/metrics';
import { EVENT_ACTION_LABEL } from '@/lib/eventActions';
import type { EventAction, InspectionTask } from '@/types/contract';
import './workbench.css';

export default function WorkbenchPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<EventAction | null>(null);

  const eventQ = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.event(eventId),
    enabled: !!eventId && eventId !== 'demo',
  });
  const tasksQ = useQuery({
    queryKey: ['tasks', 'event', eventId],
    queryFn: () => api.tasks({ eventId }),
    enabled: !!eventId && eventId !== 'demo',
    refetchInterval: 10000,
  });

  if (eventId === 'demo')
    return <div className="card state-box">请从 P03 事件列表选择一个事件进入工作台</div>;
  if (eventQ.isLoading) return <div className="state-box">加载中…</div>;
  if (eventQ.isError)
    return (
      <div className="state-box">
        事件加载失败：{(eventQ.error as Error).message}
        <button className="btn-primary" onClick={() => navigate('/events')}>返回事件中心</button>
      </div>
    );

  const event = eventQ.data!;
  const tasks = tasksQ.data?.items ?? [];

  async function doAction(action: EventAction) {
    setError('');
    setBusy(action);
    try {
      await api.eventAction(eventId, action, reason.trim() || undefined);
      setReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['business-timeline'] }),
        queryClient.invalidateQueries({ queryKey: ['event-recs', eventId] }),
      ]);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code === 'STATE_CONFLICT' ? '状态不允许该操作' : e.message}${e.details ? `（${JSON.stringify(e.details)}）` : ''}`);
      } else setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tw-wb">
      <PageHeader
        code={`P04 · ${event.eventId}`}
        title="异常研判与处置"
        badges={
          <>
            <EventStatusBadge status={event.status} />
            <Tag tone={event.priority === 'HIGH' ? 'danger' : 'muted'}>
              {event.priority === 'HIGH' ? '高优先级' : event.priority === 'LOW' ? '低优先级' : '普通'}
            </Tag>
            <Tag tone="outline">规则 {event.ruleVersion}</Tag>
          </>
        }
        description={event.title}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/events')}>事件中心</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>巡检任务</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/river-3d')}>3D 视图</Button>
          </>
        }
      />

      <div className="tw-wb-grid">
        {/* 左栏：概况 + 证据假设 + 时序 */}
        <div className="tw-wb-col">
          <Card title="事件概况" subtitle="规则识别持续变化后组织为事件；人工处置不改变历史留痕">
            <Row k="涉及范围" v={event.scopeReachIds.map((r) => reachName(r)).join(' → ') || '—'} />
            <Row k="首发时间" v={formatTime(event.firstSeenAt)} />
            <Row k="最近更新" v={formatTime(event.updatedAt)} />
            <Row k="变化次数" v={String(event.changeCount)} />
            <Row k="事件版本" v={`v${event.version}`} />
            {event.trigger && (
              <Row
                k="触发指标"
                v={`${reachName(event.trigger.reachId)} · ${simMetricName(event.trigger.metric)} ${
                  event.trigger.direction === 'UP' ? '↑' : event.trigger.direction === 'DOWN' ? '↓' : '→'
                }${event.trigger.magnitude} ${simMetricUnitByKey(event.trigger.metric)}`}
              />
            )}
            <div className="tw-row" style={{ marginTop: 10 }}>
              {event.scopeReachIds.map((rid) => (
                <Button key={rid} size="sm" variant="ghost" onClick={() => navigate(`/reaches/${rid}`)}>
                  {reachName(rid)} 断面详情
                </Button>
              ))}
            </div>
          </Card>

          <Card title="跨断面时序关系" subtitle="仅表示观测到的时间先后，不构成因果证明">
            {event.temporalRelations.length === 0 ? (
              <div className="tw-small muted">暂无跨断面关系</div>
            ) : (
              event.temporalRelations.map((r) => (
                <div key={r.relationId} style={{ fontSize: 13.5, padding: '6px 0' }}>
                  <Tag tone="watch">{r.relationType}</Tag>{' '}
                  变化先后相差 <b>{Math.round(r.deltaSeconds / 60)}</b> 分钟
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    仅表示观测到的时间先后，<b>不构成因果证明</b>（{r.evidenceState}）
                  </div>
                </div>
              ))
            )}
          </Card>

          <EvidenceHypothesisPanel eventId={eventId} />
        </div>

        {/* 中栏：统一时间线 */}
        <div className="tw-wb-col">
          <Card title="统一时间线" subtitle="事件迁移 / 任务 / 证据 / 评估 / 盲区（business_events）" padded={false}>
            <div style={{ padding: '14px 16px' }}>
              <BusinessTimeline eventId={eventId} />
            </div>
          </Card>
        </div>

        {/* 右栏：处置建议 + 关联任务 + 状态操作 */}
        <div className="tw-wb-col">
          <RecommendationsCard eventId={eventId} />

          <Card title={`关联任务（${tasks.length}）`} subtitle="事件下的现场核查与观察任务" padded={false}
            actions={<Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>全部</Button>}>
            {tasks.length === 0 ? (
              <EmptyState title="暂无关联任务" description="可通过处置建议派发，或在任务页人工创建。" />
            ) : (
              tasks.map((t: InspectionTask) => (
                <button key={t.taskId} type="button" className="tw-wb-task"
                  onClick={() => navigate('/tasks')}>
                  <div className="tw-row-between">
                    <span style={{ fontWeight: 600, color: 'var(--tw-primary-800)', fontSize: 13 }}>{t.title}</span>
                    <Tag tone={t.status === 'SUBMITTED' ? 'watch' : t.status === 'CANCELLED' ? 'muted' : 'default'}>
                      {TASK_STATUS_CN[t.status] ?? t.status}
                    </Tag>
                  </div>
                  <div className="tw-tiny" style={{ marginTop: 3 }}>
                    {reachName(t.reachId)} · {t.taskId}
                    {t.assignee ? ` · ${t.assignee}` : ''}
                  </div>
                </button>
              ))
            )}
          </Card>

          <Card title="事件操作" subtitle="仅显示状态机当前允许的动作；非法迁移返回 409">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="处置理由（可选，写入运行轨迹）"
              className="tw-wb-reason"
            />
            <div className="tw-wb-actions">
              {(event.allowedActions ?? []).length === 0 && (
                <span className="tw-tiny">当前状态暂无可执行动作</span>
              )}
              {(event.allowedActions ?? []).map((a) => (
                <Button key={a} size="sm"
                  variant={a === 'ESCALATE' || a === 'MARK_UNRESOLVED' ? 'danger' : 'ghost'}
                  disabled={busy !== null} onClick={() => doAction(a)}>
                  {busy === a ? '执行中…' : EVENT_ACTION_LABEL[a] ?? a}
                </Button>
              ))}
            </div>
            {error && <div style={{ marginTop: 10, color: 'var(--tw-danger)', fontSize: 12.5 }}>{error}</div>}
          </Card>
        </div>
      </div>

      <DisposalPipeline stage={disposalStage(event, latestOpenTask(tasks, eventId))} />
    </div>
  );
}

const TASK_STATUS_CN: Record<string, string> = {
  PENDING: '待接收', ACCEPTED: '已接收', IN_PROGRESS: '进行中',
  SUBMITTED: '待复核', CANCELLED: '已取消',
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13.5 }}>
      <span className="muted">{k}</span>
      <span style={{ textAlign: 'right' }}>{v}</span>
    </div>
  );
}

const EVIDENCE_TYPE_CN: Record<string, string> = {
  OBSERVATION: '观测', RULE: '规则', MANUAL: '人工巡检', EXTERNAL: '外部', MODEL: '模型', KNOWLEDGE: '知识',
};
const POL_CN: Record<string, string> = { SUPPORT: '支持', COUNTER: '反证', MISSING: '缺失' };
const HYP_CN: Record<string, string> = {
  OPEN: '待验证', PARTIAL_SUPPORT: '部分支持', SUPPORT: '支持', NOT_SUPPORT: '不支持', UNKNOWN: '证据不足',
};

function EvidenceHypothesisPanel({ eventId }: { eventId: string }) {
  const evidenceQ = useQuery({ queryKey: ['evidence', eventId], queryFn: () => api.evidence(eventId) });
  const hypQ = useQuery({ queryKey: ['hypotheses', eventId], queryFn: () => api.hypotheses(eventId) });
  const evidence = evidenceQ.data ?? [];
  const hypotheses = hypQ.data ?? [];

  return (
    <>
      <Card title={`证据链（${evidence.length}）`} subtitle="证据支持/反驳假设，不直接改写事件状态">
        {evidence.length === 0 ? (
          <div className="tw-small muted">暂无证据</div>
        ) : (
          evidence.map((e) => (
            <div key={e.evidenceId} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: '1px solid var(--tw-border)', fontSize: 12.5 }}>
              <div style={{ whiteSpace: 'nowrap' }}>
                <Tag tone="outline">{EVIDENCE_TYPE_CN[e.type] ?? e.type}</Tag>{' '}
                <Tag tone={e.polarity === 'SUPPORT' ? 'ok' : e.polarity === 'COUNTER' ? 'danger' : 'watch'}>
                  {POL_CN[e.polarity] ?? e.polarity}
                </Tag>
              </div>
              <div>{e.note ?? e.sourceRef}</div>
            </div>
          ))
        )}
      </Card>

      <Card title={`假设（${hypotheses.length}）`} subtitle="假设状态由证据支持度决定，证据不足时标记为待验证">
        {hypotheses.length === 0 ? (
          <div className="tw-small muted">暂无假设</div>
        ) : (
          hypotheses.map((h) => (
            <div key={h.hypothesisId} style={{ padding: '8px 0', borderBottom: '1px solid var(--tw-border)' }}>
              <Tag tone={h.state === 'SUPPORT' ? 'ok' : h.state === 'NOT_SUPPORT' ? 'muted' : 'watch'}>
                {HYP_CN[h.state] ?? h.state}
              </Tag>
              <div style={{ fontSize: 13, margin: '4px 0' }}>{h.statement}</div>
              <div className="tw-tiny">支持 {h.supportRefs.length} · 反证 {h.counterRefs.length}</div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
