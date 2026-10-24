import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import { EventStatusBadge, reachName, formatTime } from '@/components/EventBits';
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
  const authenticated = useAuthStore((s) => s.authenticated);
  useRealtimeStream(authenticated);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<EventAction | null>(null);

  const eventQ = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.event(eventId),
    enabled: authenticated && !!eventId && eventId !== 'demo',
  });

  if (!authenticated) return <div className="card state-box">请先登录</div>;
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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)', fontSize: 18 }}>
          P04 演化研判工作台 · {event.eventId}
        </h2>
        <EventStatusBadge status={event.status} />
        <span className={event.priority === 'HIGH' ? 'badge badge-danger' : 'badge badge-ok'}>
          {event.priority === 'HIGH' ? '高优先级' : '普通'}
        </span>
        <span className="source-tag source-tag-simulated" style={{ marginLeft: 'auto' }}>
          规则 {event.ruleVersion}
        </span>
        <Link to={`/reviews/${event.eventId}`}
          style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--tw-accent)', borderRadius: 6, color: 'var(--tw-accent)' }}>
          研判单
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* 左：事件信息 + 时序关系 + 状态历史 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card">
            <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>{event.title}</h3>
            <Row k="涉及范围" v={event.scopeReachIds.map((r) => reachName(r)).join(' → ') || '—'} />
            <Row k="首发时间" v={formatTime(event.firstSeenAt)} />
            <Row k="最近更新" v={formatTime(event.updatedAt)} />
            <Row k="变化次数" v={String(event.changeCount)} />
            <Row k="事件版本" v={`v${event.version}`} />
          </section>

          <section className="card">
            <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>跨断面时序关系</h3>
            {event.temporalRelations.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>暂无跨断面关系</div>
            ) : (
              <>
                {event.temporalRelations.map((r) => (
                  <div key={r.relationId} style={{ fontSize: 13.5, padding: '6px 0' }}>
                    <span className="badge badge-watch">{r.relationType}</span>{' '}
                    变化先后相差 <b>{Math.round(r.deltaSeconds / 60)}</b> 分钟
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      仅表示观测到的时间先后，<b>不构成因果证明</b>（{r.evidenceState}）
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>

          <EvidenceHypothesisPanel eventId={eventId} />

          <section className="card">
            <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>状态迁移历史</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {event.transitions.map((t, i) => (
                  <tr key={i} style={{ borderTop: i ? '1px solid var(--tw-border)' : 'none' }}>
                    <td style={{ padding: '7px 0' }} className="muted">{formatTime(t.createdAt)}</td>
                    <td>
                      {t.fromStatus ?? '—'} → <b>{t.toStatus}</b>
                    </td>
                    <td>
                      <span className={`badge ${t.trigger === 'MANUAL' ? 'badge-watch' : 'badge-ok'}`}>
                        {t.trigger === 'RULE' ? '规则' : t.trigger === 'MANUAL' ? '人工' : '场景'}
                      </span>
                    </td>
                    <td className="muted">{t.reason}</td>
                    <td className="muted">{t.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* 右：人工操作（状态机） */}
        <aside className="card" style={{ alignSelf: 'start' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>人工处置</h3>
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
              <button
                key={a.action}
                disabled={busy !== null}
                onClick={() => doAction(a.action)}
                style={{
                  padding: '8px 10px', borderRadius: 6, cursor: busy ? 'wait' : 'pointer',
                  border: '1px solid var(--tw-border)', background: '#fff', textAlign: 'left',
                  fontSize: 13,
                }}
              >
                {a.label}
                {a.hint && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{a.hint}</span>}
              </button>
            ))}
          </div>
          {error && (
            <div style={{ marginTop: 10, color: 'var(--tw-danger)', fontSize: 12.5 }}>{error}</div>
          )}
          <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
            非法迁移由后端 8 态状态机拒绝（返回 409）。
            证据/假设/再评估面板将在 M3 提供。
          </div>
        </aside>
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
      <section className="card">
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>证据链（{evidence.length}）</h3>
        {evidence.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>暂无证据</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.evidenceId} style={{ borderTop: '1px solid var(--tw-border)' }}>
                  <td style={{ padding: '7px 8px 7px 0', whiteSpace: 'nowrap' }}>
                    <span className="badge" style={{ background: '#eef2f7', color: '#334155' }}>
                      {EVIDENCE_TYPE_CN[e.type] ?? e.type}
                    </span>{' '}
                    <span className={`badge ${e.polarity === 'SUPPORT' ? 'badge-ok' : e.polarity === 'COUNTER' ? 'badge-danger' : 'badge-watch'}`}>
                      {POL_CN[e.polarity] ?? e.polarity}
                    </span>
                  </td>
                  <td>{e.note ?? e.sourceRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>假设（{hypotheses.length}）</h3>
        {hypotheses.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>暂无假设</div>
        ) : (
          hypotheses.map((h) => (
            <div key={h.hypothesisId} style={{ padding: '8px 0', borderBottom: '1px solid var(--tw-border)' }}>
              <span className={`badge ${h.state === 'SUPPORT' ? 'badge-ok' : h.state === 'NOT_SUPPORT' ? 'badge-offline' : 'badge-watch'}`}>
                {HYP_CN[h.state] ?? h.state}
              </span>
              <div style={{ fontSize: 13, margin: '4px 0' }}>{h.statement}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                支持 {h.supportRefs.length} · 反证 {h.counterRefs.length}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
