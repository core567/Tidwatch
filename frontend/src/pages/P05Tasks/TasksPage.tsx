import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { reachName } from '@/components/EventBits';
import type { InspectionTask } from '@/types/contract';

const FILTERS = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待接收' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'SUBMITTED', label: '已回填' },
  { value: 'CANCELLED', label: '已取消' },
];

const STATUS: Record<string, { text: string; cls: string }> = {
  PENDING: { text: '待接收', cls: 'badge-watch' },
  ACCEPTED: { text: '已接收', cls: 'badge-watch' },
  IN_PROGRESS: { text: '进行中', cls: 'badge-watch' },
  SUBMITTED: { text: '已回填', cls: 'badge-ok' },
  CANCELLED: { text: '已取消', cls: 'badge-offline' },
};
const CONCLUSION = { NORMAL: '正常', ABNORMAL: '异常', UNCERTAIN: '无法确认' };

export default function TasksPage() {
  const authenticated = useAuthStore((s) => s.authenticated);
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin';
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const tasksQ = useQuery({
    queryKey: ['tasks', status],
    queryFn: () => api.tasks({ status: status || undefined }),
    enabled: authenticated,
    refetchInterval: 10000,
  });

  if (!authenticated) return <div className="card state-box">请先登录</div>;
  const tasks = (tasksQ.data?.items ?? []) as InspectionTask[];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)' }}>P05 巡检与观察任务</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {FILTERS.map((f) => (
            <button key={f.value} onClick={() => setStatus(f.value)}
              style={pill(status === f.value)}>{f.label}</button>
          ))}
          {isAdmin && (
            <button className="btn-primary" style={{ padding: '5px 12px', fontSize: 13 }}
              onClick={() => setShowCreate(true)}>+ 派发任务</button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {tasksQ.isLoading && <div className="state-box">加载中…</div>}
        {!tasksQ.isLoading && tasks.length === 0 && (
          <div className="state-box">
            <div>暂无任务</div>
            <div className="muted" style={{ fontSize: 13 }}>
              运行 S2/S3 场景会自动对下游断面派发巡检任务
            </div>
          </div>
        )}
        {tasks.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--tw-text-secondary)', background: '#f7fafc' }}>
                <Th>任务</Th><Th>断面</Th><Th>状态</Th><Th>优先级</Th>
                <Th>指派人</Th><Th>回填结论</Th><Th>现场记录</Th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.taskId} style={{ borderTop: '1px solid var(--tw-border)' }}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    {t.eventId && <div className="muted" style={{ fontSize: 11.5 }}>{t.eventId}</div>}
                  </Td>
                  <Td>{reachName(t.reachId)}</Td>
                  <Td><span className={`badge ${STATUS[t.status]?.cls ?? 'badge-offline'}`}>{STATUS[t.status]?.text ?? t.status}</span></Td>
                  <Td>{t.priority === 'HIGH' ? <span className="badge badge-danger">高</span> : '普通'}</Td>
                  <Td className="muted">{t.assignee ?? '—'}</Td>
                  <Td>{t.resultConclusion ? <span className="badge badge-ok">{CONCLUSION[t.resultConclusion] ?? t.resultConclusion}</span> : '—'}</Td>
                  <Td className="muted" style={{ maxWidth: 240 }}>{t.resultNote ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={() => {
        setShowCreate(false);
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }} />}
    </div>
  );
}

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [reachId, setReachId] = useState('reach-c');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (title.trim().length < 2) { setError('任务标题至少 2 个字'); return; }
    setBusy(true); setError('');
    try {
      await api.createTask({ reachId, title: title.trim(), reason: reason.trim(), priority: 'NORMAL' });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 420, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px' }}>派发巡检任务</h3>
        <label className="muted" style={{ fontSize: 12 }}>监测断面</label>
        <select value={reachId} onChange={(e) => setReachId(e.target.value)} style={input}>
          <option value="reach-a">上游 A</option>
          <option value="reach-b">中游 B</option>
          <option value="reach-c">下游 C</option>
        </select>
        <label className="muted" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>任务标题</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：现场核查 C 断面水位" style={input} />
        <label className="muted" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>说明</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={{ ...input, height: 56 }} />
        {error && <div style={{ color: 'var(--tw-danger)', fontSize: 12.5, margin: '8px 0' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} style={{ ...input, width: 'auto', cursor: 'pointer' }}>取消</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>派发</button>
        </div>
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%', padding: 8, marginTop: 4, border: '1px solid var(--tw-border)',
  borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
};
function pill(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
    border: '1px solid var(--tw-border)',
    background: active ? 'var(--tw-primary-800)' : '#fff',
    color: active ? '#fff' : 'var(--tw-text)',
  };
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', fontWeight: 500, fontSize: 12.5 }}>{children}</th>;
}
function Td({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <td className={className} style={{ padding: '11px 14px', ...style }}>{children}</td>;
}
