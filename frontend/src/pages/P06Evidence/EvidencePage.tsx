import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { reachName } from '@/components/EventBits';
import { Button, Card, PageHeader, Table, Td, Th, Tag } from '@/components/ui';
import type { ActiveEvent, Evidence, Hypothesis } from '@/types/contract';

const EVIDENCE_TYPE: Record<string, string> = {
  OBSERVATION: '观测', RULE: '规则', MANUAL: '人工巡检',
  EXTERNAL: '外部', MODEL: '模型', KNOWLEDGE: '知识',
};
const POLARITY: Record<string, { text: string; cls: string }> = {
  SUPPORT: { text: '支持', cls: 'badge-ok' },
  COUNTER: { text: '反证', cls: 'badge-danger' },
  MISSING: { text: '缺失', cls: 'badge-watch' },
};
const HYP_STATE: Record<string, { text: string; cls: string }> = {
  OPEN: { text: '待验证', cls: 'badge-watch' },
  PARTIAL_SUPPORT: { text: '部分支持', cls: 'badge-watch' },
  SUPPORT: { text: '支持', cls: 'badge-ok' },
  NOT_SUPPORT: { text: '不支持', cls: 'badge-offline' },
  UNKNOWN: { text: '证据不足', cls: 'badge-offline' },
};

export default function EvidencePage() {
  const [eventId, setEventId] = useState('');
  const queryClient = useQueryClient();

  const eventsQ = useQuery({
    queryKey: ['events', 'ALL'],
    queryFn: () => api.events({ pageSize: 100 }),
  });
  const events = (eventsQ.data?.items ?? []) as ActiveEvent[];
  const selectedId = eventId || events[0]?.eventId || '';

  const evidenceQ = useQuery({
    queryKey: ['evidence', selectedId],
    queryFn: () => api.evidence(selectedId),
    enabled: !!selectedId,
  });
  const hypQ = useQuery({
    queryKey: ['hypotheses', selectedId],
    queryFn: () => api.hypotheses(selectedId),
    enabled: !!selectedId,
  });
  const evidence = (evidenceQ.data ?? []) as Evidence[];
  const hypotheses = (hypQ.data ?? []) as Hypothesis[];


  const navigate = useNavigate();

  return (
    <div className="tw-stack">
      <PageHeader
        code="P06"
        title="证据与智能分析"
        badges={<Tag tone="outline">证据/模型仅给建议，人工确认后才成为结论</Tag>}
        description="按事件组织证据与假设；规则判定与模型评分并列展示，模型不驱动事件状态。"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/events')}>
              事件中心
            </Button>
            {selectedId && (
              <Button size="sm" onClick={() => navigate(`/events/${selectedId}/workbench`)}>
                进入工作台
              </Button>
            )}
          </>
        }
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {events.length === 0 && <span className="muted" style={{ fontSize: 13 }}>暂无事件（运行 S2/S3 场景产生）</span>}
        {events.map((e) => (
          <button key={e.eventId} onClick={() => setEventId(e.eventId)}
            style={{
              padding: '6px 12px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--tw-border)',
              background: selectedId === e.eventId ? 'var(--tw-primary-800)' : '#fff',
              color: selectedId === e.eventId ? '#fff' : 'var(--tw-text)',
            }}>
            {e.eventId} · {e.scopeReachIds.map(reachName).join('→')}
          </button>
        ))}
      </div>

      {selectedId && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          {/* 证据库 */}
          <Card title={`证据库（${evidence.length}）`} subtitle="支持 / 反证 / 缺失证据分开标注">
            {evidence.length === 0 && <div className="muted" style={{ fontSize: 13 }}>暂无证据</div>}
            {evidence.map((e) => (
              <div key={e.evidenceId} style={{ padding: '9px 0', borderBottom: '1px solid var(--tw-border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                  <Tag tone="outline">{EVIDENCE_TYPE[e.type] ?? e.type}</Tag>
                  <Tag tone={e.polarity === 'SUPPORT' ? 'ok' : e.polarity === 'COUNTER' ? 'danger' : 'watch'}>
                    {POLARITY[e.polarity]?.text ?? e.polarity}
                  </Tag>
                  <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{e.createdBy}</span>
                </div>
                <div style={{ fontSize: 13 }}>{e.note ?? e.sourceRef}</div>
              </div>
            ))}
          </Card>

          {/* 假设 */}
          <Card title="假设与验证" subtitle="结论强度不得超过证据">
            <CreateHypothesis eventId={selectedId}
              onCreated={() => queryClient.invalidateQueries({ queryKey: ['hypotheses', selectedId] })} />
            {hypotheses.length === 0 && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>暂无假设</div>}
            {hypotheses.map((h) => (
              <div key={h.hypothesisId} style={{ padding: '9px 0', borderBottom: '1px solid var(--tw-border)' }}>
                <Tag tone={h.state === 'SUPPORT' ? 'ok' : h.state === 'NOT_SUPPORT' ? 'muted' : 'watch'}>
                  {HYP_STATE[h.state]?.text ?? h.state}
                </Tag>
                <div style={{ fontSize: 13, margin: '5px 0' }}>{h.statement}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  支持 {h.supportRefs.length} · 反证 {h.counterRefs.length}
                </div>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.7 }}>
              结论强度不得超过证据：模型/规则仅给出建议，人工确认后才标记为结论；
              时序关系只表示观测先后，不构成因果。
            </p>
          </Card>
        </div>

        <MlComparisonPanel />
        </>
      )}
    </div>
  );
}

function CreateHypothesis({ eventId, onCreated }: { eventId: string; onCreated: () => void }) {
  const [statement, setStatement] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (statement.trim().length < 2) return;
    setBusy(true); setError('');
    try {
      await api.createHypothesis(eventId, statement.trim());
      setStatement('');
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <textarea value={statement} onChange={(e) => setStatement(e.target.value)}
        placeholder="提出待验证假设，如：异常将向下游传播…"
        style={{ width: '100%', height: 52, padding: 8, border: '1px solid var(--tw-border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, gap: 8 }}>
        {error && <span style={{ color: 'var(--tw-danger)', fontSize: 12, alignSelf: 'center' }}>{error}</span>}
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? '提交中…' : '建立假设'}
        </Button>
      </div>
    </div>
  );
}

function MlComparisonPanel() {
  const mlQ = useQuery({ queryKey: ['ml-comparison'], queryFn: api.mlComparison });
  const items = mlQ.data?.items ?? [];
  return (
    <Card
      title="规则 vs 模型对照"
      subtitle={`${mlQ.data?.model ?? 'IsolationForest'} · 模型仅为辅助建议，不驱动事件状态`}
      padded={false}
    >
      <Table>
        <thead>
          <tr>
            <Th>断面</Th>
            <Th>规则判定</Th>
            <Th>模型状态</Th>
            <Th>模型评分</Th>
            <Th>一致性</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.reachId}>
              <Td>{reachName(m.reachId)}</Td>
              <Td>
                <Tag tone={m.ruleAnomaly ? 'danger' : 'ok'}>
                  {m.ruleAnomaly ? (m.ruleStatus ?? '异常') : '正常'}
                </Tag>
              </Td>
              <Td>
                <Tag tone={m.mlState === 'ANOMALY' ? 'danger' : m.mlState === 'NORMAL' ? 'ok' : 'muted'}>
                  {m.mlState === 'ANOMALY' ? '异常' : m.mlState === 'NORMAL' ? '正常' : '样本不足'}
                </Tag>
              </Td>
              <Td>{m.mlScore != null ? m.mlScore.toFixed(2) : '—'}</Td>
              <Td>
                {m.agree === null ? (
                  <span className="muted">—</span>
                ) : m.agree ? (
                  <span style={{ color: 'var(--tw-ok)' }}>一致</span>
                ) : (
                  <span style={{ color: 'var(--tw-watch)' }}>不一致（以规则为准）</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
