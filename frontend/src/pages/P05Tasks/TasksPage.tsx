import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { reachName } from '@/components/EventBits';
import { TaskPhotos } from '@/components/TaskPhotos';
import TaskDetailDrawer from '@/components/TaskDetailDrawer';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Table,
  Td,
  Th,
  Tag,
} from '@/components/ui';
import type { InspectionTask } from '@/types/contract';

const FILTERS = [
  { value: '', label: '全部' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '待接收' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'SUBMITTED', label: '待复核' },
  { value: 'APPROVED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
];

const STATUS: Record<string, { text: string; tone: 'ok' | 'watch' | 'muted' }> = {
  DRAFT: { text: '草稿', tone: 'muted' },
  PENDING: { text: '待接收', tone: 'watch' },
  ACCEPTED: { text: '已接收', tone: 'watch' },
  IN_PROGRESS: { text: '进行中', tone: 'watch' },
  SUBMITTED: { text: '待复核', tone: 'watch' },
  APPROVED: { text: '已完成', tone: 'ok' },
  CANCELLED: { text: '已取消', tone: 'muted' },
};
const CONCLUSION = { NORMAL: '正常', ABNORMAL: '异常', UNCERTAIN: '无法确认' };

export default function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const tasksQ = useQuery({
    queryKey: ['tasks', status],
    // PC 管理端包含草稿
    queryFn: () => api.tasks({ status: status || undefined, includeDrafts: true }),
    refetchInterval: 10000,
  });

  const tasks = (tasksQ.data?.items ?? []) as InspectionTask[];

  return (
    <div className="tw-stack">
      <PageHeader
        code="P05"
        title="巡检与观察任务"
        badges={<Tag tone="outline">演示模式：派发对本地开放</Tag>}
        description="任务由事件研判派发或人工创建；现场回填的照片可在 PC 端直接查看，结论不作为模型输出。"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
              ← 返回监测总览
            </Button>
            <Segmented
              ariaLabel="筛选任务状态"
              value={status}
              onChange={setStatus}
              options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            />
            <Button onClick={() => setShowCreate(true)}>+ 派发任务</Button>
          </>
        }
      />

      <Card
        title={`任务列表（${tasksQ.data?.total ?? 0}）`}
        subtitle="点击事件编号可回看对应事件工作台"
        actions={
          <Button size="sm" variant="ghost" onClick={() => tasksQ.refetch()}>
            刷新
          </Button>
        }
        padded={false}
      >
        {tasksQ.isLoading && <div className="state-box">加载中…</div>}
        {!tasksQ.isLoading && tasks.length === 0 && (
          <EmptyState
            title="暂无任务"
            description="运行 S2/S3 场景会自动对下游断面派发巡检任务，也可手动派发。"
          />
        )}
        {tasks.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>任务</Th>
                <Th>断面</Th>
                <Th>关联事件</Th>
                <Th>状态</Th>
                <Th>优先级</Th>
                <Th>指派人</Th>
                <Th>回填结论</Th>
                <Th>照片</Th>
                <Th>现场记录</Th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.taskId} className="tw-row-click" onClick={() => setOpenTaskId(t.taskId)}>
                  <Td>
                    <div style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>{t.title}</div>
                    <div className="tw-tiny">
                      {t.taskId} · {t.actionType}
                    </div>
                  </Td>
                  <Td>{reachName(t.reachId)}</Td>
                  <Td>
                    {t.eventId ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/events/${t.eventId}/workbench`);
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          color: 'var(--tw-accent)',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        {t.eventId} ›
                      </button>
                    ) : (
                      <span className="tw-tiny">—</span>
                    )}
                  </Td>
                  <Td>
                    <Tag tone={STATUS[t.status]?.tone ?? 'muted'}>
                      {STATUS[t.status]?.text ?? t.status}
                    </Tag>
                  </Td>
                  <Td>
                    {t.priority === 'HIGH' ? (
                      <Tag tone="danger">高</Tag>
                    ) : t.priority === 'LOW' ? (
                      <Tag tone="muted">低</Tag>
                    ) : (
                      <span className="tw-tiny">普通</span>
                    )}
                  </Td>
                  <Td className="tw-tiny">{t.assignee ?? '—'}</Td>
                  <Td>
                    {t.resultConclusion ? (
                      <Tag tone={t.resultConclusion === 'NORMAL' ? 'ok' : 'watch'}>
                        {CONCLUSION[t.resultConclusion] ?? t.resultConclusion}
                      </Tag>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <TaskPhotos taskId={t.taskId} count={t.attachmentIds.length} />
                  </Td>
                  <Td className="tw-tiny" style={{ maxWidth: 240 }}>
                    {t.resultNote ?? '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}
      {openTaskId && (
        <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      )}
    </div>
  );
}

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [reachId, setReachId] = useState('reach-c');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(draft: boolean) {
    if (!draft && title.trim().length < 2) {
      setError('任务标题至少 2 个字');
      return;
    }
    if (draft && title.trim().length < 2) {
      setError('草稿标题至少 2 个字');
      return;
    }
    setBusy(draft ? 'draft' : 'dispatch');
    setError('');
    try {
      await api.createTask({
        reachId,
        title: title.trim(),
        reason: reason.trim(),
        priority: 'NORMAL',
        draft,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 420, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px' }}>新建巡检任务</h3>
        <label className="muted" style={{ fontSize: 12 }}>
          监测断面
        </label>
        <select value={reachId} onChange={(e) => setReachId(e.target.value)} style={input}>
          <option value="reach-a">上游 A</option>
          <option value="reach-b">中游 B</option>
          <option value="reach-c">下游 C</option>
        </select>
        <label className="muted" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
          任务标题
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="如：现场核查 C 断面水位"
          style={input}
        />
        <label className="muted" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
          说明
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          style={{ ...input, height: 56 }}
        />
        {error && (
          <div style={{ color: 'var(--tw-danger)', fontSize: 12.5, margin: '8px 0' }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 12 }}>
          <Button variant="ghost" disabled={busy !== null} onClick={() => submit(true)}>
            {busy === 'draft' ? '保存中…' : '存草稿'}
          </Button>
          <div className="tw-row" style={{ gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button disabled={busy !== null} onClick={() => submit(false)}>
              {busy === 'dispatch' ? '派发中…' : '直接派发'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%',
  padding: 8,
  marginTop: 4,
  border: '1px solid var(--tw-border)',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};
