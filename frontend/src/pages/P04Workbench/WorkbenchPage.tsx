import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Button, Card, PageHeader, Tag } from '@/components/ui';
import { EventStatusBadge, reachName, formatTime } from '@/components/EventBits';
import { simMetricName, simMetricUnitByKey } from '@/lib/metrics';
import type { EventAction } from '@/types/contract';

// 每个当前状态允许的人工动作（与后端 8 态状态机一致）
const ACTIONS: { action: EventAction; label: string; hint?: string }[] = [
  { action: 'START_INVESTIGATION', label: '开始调查' },
  { action: 'ESCALATE', label: '升级关注' },
  { action: 'KEEP_MONITORING', label: '持续观察' },
  { action: 'NARROW_SCOPE', label: '范围收窄' },
  { action: 'MARK_RECOVERY_PENDING', label: '进入恢复待确认' },
  { action: 'CONFIRM_RECOVERED', label: '确认恢复', hint: '须先处于恢复待确认' },
  { action: 'MARK_UNRESOLVED', label: '标记无法判定' },
  { action: 'REOPEN', label: '重新打开' },
];

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

  async function doAction(action: EventAction) {
    setError('');
    setBusy(action);
    try {
      await api.eventAction(eventId, action, reason.trim() || undefined);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (e) {
      if (e instanceof ApiError) {
        // 409：状态机拒绝
        setError(`${e.code === 'STATE_CONFLICT' ? '状态不允许该操作' : e.message}${e.details ? `（${JSON.stringify(e.details)}）` : ''}`);
      } else setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tw-stack">
      <PageHeader
        code={`P04 · ${event.eventId}`}
        title="演化研判工作台"
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
            <Button variant="ghost" size="sm" onClick={() => navigate('/events')}>
              事件中心
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
              巡检任务
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/river-3d')}>
              3D 视图
            </Button>
            <Button size="sm" onClick={() => navigate(`/reviews/${event.eventId}`)}>
              研判单
            </Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* 左：事件信息 + 时序关系 + 状态历史 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                <Button
                  key={rid}
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/reaches/${rid}`)}
                >
                  {reachName(rid)} 断面详情
                </Button>
              ))}
            </div>
          </Card>

          <Card title="跨断面时序关系" subtitle="仅表示观测到的时间先后，不构成因果证明">
            {event.temporalRelations.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>暂无跨断面关系</div>
            ) : (
              <>
                {event.temporalRelations.map((r) => (
                  <div key={r.relationId} style={{ fontSize: 13.5, padding: '6px 0' }}>
                    <Tag tone="watch">{r.relationType}</Tag>{' '}
                    变化先后相差 <b>{Math.round(r.deltaSeconds / 60)}</b> 分钟
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      仅表示观测到的时间先后，<b>不构成因果证明</b>（{r.evidenceState}）
                    </div>
                  </div>
                ))}
              </>
            )}
          </Card>

          <EvidenceHypothesisPanel eventId={eventId} />

          <Card title="状态迁移历史" padded={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {event.transitions.map((t, i) => (
                  <tr key={i} style={{ borderTop: i ? '1px solid var(--tw-border)' : 'none' }}>
                    <td style={{ padding: '7px 14px' }} className="muted">{formatTime(t.createdAt)}</td>
                    <td style={{ padding: '7px 8px' }}>
                      {t.fromStatus ?? '—'} → <b>{t.toStatus}</b>
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <Tag tone={t.trigger === 'MANUAL' ? 'watch' : 'ok'}>
                        {t.trigger === 'RULE' ? '规则' : t.trigger === 'MANUAL' ? '人工' : '场景'}
                      </Tag>
                    </td>
                    <td style={{ padding: '7px 8px' }} className="muted">{t.reason}</td>
                    <td style={{ padding: '7px 14px' }} className="muted">{t.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* 右：人工操作（状态机） */}
        <div style={{ alignSelf: 'start' }}>
        <Card title="人工处置" subtitle="非法迁移由后端 8 态状态机拒绝并返回 409">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="处置理由（可选，将写入运行轨迹）"
            style={{
              width: '100%', height: 64, marginBottom: 10, padding: 8,
              border: '1px solid var(--tw-border)', borderRadius: 6, fontSize: 13, resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ACTIONS.map((a) => (
              <Button
                key={a.action}
                variant="ghost"
                disabled={busy !== null}
                onClick={() => doAction(a.action)}
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                {a.label}
                {a.hint && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{a.hint}</span>}
              </Button>
            ))}
          </div>
          {error && (
            <div style={{ marginTop: 10, color: 'var(--tw-danger)', fontSize: 12.5 }}>{error}</div>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13.5 }}>
      <span className="muted">{k}</span>
      <span>{v}</span>
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
  const evidenceQ = useQuery({
    queryKey: ['evidence', eventId], queryFn: () => api.evidence(eventId),
  });
  const hypQ = useQuery({
    queryKey: ['hypotheses', eventId], queryFn: () => api.hypotheses(eventId),
  });
  const evidence = evidenceQ.data ?? [];
  const hypotheses = hypQ.data ?? [];

  return (
    <>
      <Card title={`证据链（${evidence.length}）`} subtitle="证据支持/反驳假设，不直接改写事件状态">
        {evidence.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>暂无证据</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.evidenceId} style={{ borderTop: '1px solid var(--tw-border)' }}>
                  <td style={{ padding: '7px 8px 7px 0', whiteSpace: 'nowrap' }}>
                    <Tag tone="outline">{EVIDENCE_TYPE_CN[e.type] ?? e.type}</Tag>{' '}
                    <Tag tone={e.polarity === 'SUPPORT' ? 'ok' : e.polarity === 'COUNTER' ? 'danger' : 'watch'}>
                      {POL_CN[e.polarity] ?? e.polarity}
                    </Tag>
                  </td>
                  <td>{e.note ?? e.sourceRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`假设（${hypotheses.length}）`} subtitle="假设状态由证据支持度决定，证据不足时标记为待验证">
        {hypotheses.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>暂无假设</div>
        ) : (
          hypotheses.map((h) => (
            <div key={h.hypothesisId} style={{ padding: '8px 0', borderBottom: '1px solid var(--tw-border)' }}>
              <Tag tone={h.state === 'SUPPORT' ? 'ok' : h.state === 'NOT_SUPPORT' ? 'muted' : 'watch'}>
                {HYP_CN[h.state] ?? h.state}
              </Tag>
              <div style={{ fontSize: 13, margin: '4px 0' }}>{h.statement}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                支持 {h.supportRefs.length} · 反证 {h.counterRefs.length}
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
