import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { EventStatusBadge, reachName } from '@/components/EventBits';
import SourceTag from '@/components/SourceTag';

export default function ReviewsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const authenticated = useAuthStore((s) => s.authenticated);

  const reviewQ = useQuery({
    queryKey: ['review', eventId],
    queryFn: () => api.eventReview(eventId!),
    enabled: authenticated && !!eventId,
  });

  if (!authenticated) return <div className="card state-box">请先登录</div>;
  if (reviewQ.isLoading) return <div className="state-box">生成研判单中…</div>;
  if (reviewQ.isError)
    return (
      <div className="state-box">
        研判单生成失败：{(reviewQ.error as Error).message}
        <button className="btn-primary" onClick={() => navigate('/events')}>返回事件中心</button>
      </div>
    );

  const r = reviewQ.data!;
  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }} className="no-print">
        <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={() => navigate(`/events/${eventId}/workbench`)}>← 返回工作台</button>
        <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={() => window.print()}>🖨 打印 / 导出 PDF</button>
        <SourceTag source="SIMULATED" />
      </div>

      <div className="card" style={{ padding: 28 }}>
        <header style={{ textAlign: 'center', borderBottom: '2px solid var(--tw-primary-800)', paddingBottom: 14, marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--tw-primary-800)' }}>异常事件演化研判单</h1>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {r.eventId} · 规则 {r.ruleVersion ?? 'demo-rules-v1'}
          </div>
        </header>

        <h2 style={h2}>一、事件概要</h2>
        <Grid>
          <Item k="标题" v={r.title} />
          <Item k="当前状态" v={<EventStatusBadge status={r.status} />} />
          <Item k="涉及范围" v={r.scope.map(reachName).join(' → ')} />
          <Item k="事件类型" v={r.eventType ?? '—'} />
        </Grid>

        <h2 style={h2}>二、范围演化（版本）</h2>
        {r.scopeHistory.map((s) => (
          <div key={s.version} style={{ fontSize: 13.5, padding: '6px 0', borderBottom: '1px dashed var(--tw-border)' }}>
            v{s.version}：<b>{s.reaches.map(reachName).join(' → ') || '—'}</b>
            {s.reason && <span className="muted"> — {s.reason}</span>}
          </div>
        ))}

        <h2 style={h2}>三、跨断面时序关系</h2>
        {r.temporalRelations.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>暂无</div>
        ) : (
          r.temporalRelations.map((t, i) => (
            <div key={i} style={{ fontSize: 13.5 }}>
              变化先后相差 <b>{Math.round(t.deltaSeconds / 60)}</b> 分钟
              <span className="muted"> — {t.note}</span>
            </div>
          ))
        )}

        <h2 style={h2}>四、假设与证据</h2>
        {r.hypotheses.map((h) => (
          <div key={h.id} style={{ marginBottom: 8, fontSize: 13.5 }}>
            <span className={`badge ${h.state === 'NOT_SUPPORT' ? 'badge-offline' : 'badge-watch'}`}>{h.state}</span>{' '}
            {h.statement}
            <span className="muted"> （支持 {h.support} / 反证 {h.counter}）</span>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
          <div>
            <b style={{ color: 'var(--tw-ok)' }}>支持证据（{r.supportingEvidence.length}）</b>
            {r.supportingEvidence.map((e) => (
              <div key={e.id} style={{ fontSize: 12.5, padding: '5px 0' }}>
                <span className="badge badge-ok">{e.type}</span> {e.note}
              </div>
            ))}
          </div>
          <div>
            <b style={{ color: 'var(--tw-danger)' }}>反证/缺失（{r.counterEvidence.length}）</b>
            {r.counterEvidence.map((e) => (
              <div key={e.id} style={{ fontSize: 12.5, padding: '5px 0' }}>
                <span className="badge badge-danger">{e.polarity}</span> {e.note}
              </div>
            ))}
          </div>
        </div>

        <h2 style={h2}>五、再评估记录</h2>
        {r.assessments.map((a) => (
          <div key={a.version} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px dashed var(--tw-border)' }}>
            v{a.version}：{a.reason || '再评估'}
            {a.warnings.length > 0 && <span className="muted">（{a.warnings.join('；')}）</span>}
          </div>
        ))}

        <h2 style={h2}>六、未解决问题与后续</h2>
        {r.unresolved.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>无未解决项</div>
        ) : (
          <ul style={{ fontSize: 13.5 }}>
            {r.unresolved.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        )}

        <h2 style={h2}>七、运行轨迹（节选）</h2>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {r.trace.slice(-20).map((t, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--tw-text-secondary)' }}>
              {t.actor} · {t.action} {t.detail ? `— ${t.detail}` : ''}
            </div>
          ))}
        </div>

        <p style={{ marginTop: 20, padding: 12, background: '#f7fafc', borderRadius: 8, fontSize: 12.5, color: 'var(--tw-text-secondary)' }}>
          {r.disclaimer}
        </p>
      </div>
    </div>
  );
}

const h2: React.CSSProperties = { fontSize: 15, margin: '20px 0 8px', color: 'var(--tw-primary-800)' };
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>{children}</div>;
}
function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13.5, display: 'flex', gap: 8 }}>
      <span className="muted" style={{ minWidth: 70 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
