import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Button, Drawer, EmptyState, Tag } from '@/components/ui';
import { formatTime, reachName } from '@/components/EventBits';
import type { InspectionTask, TaskSubmission, TaskReviewRecord } from '@/types/contract';

const CONCLUSION_CN: Record<string, string> = { NORMAL: '正常', ABNORMAL: '异常', UNCERTAIN: '无法确认' };

/** PC 巡检任务详情：版本提交、照片、复核记录与按状态的操作。 */
export function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const taskQ = useQuery({ queryKey: ['task', taskId], queryFn: () => api.task(taskId) });
  const subsQ = useQuery({ queryKey: ['task-subs', taskId], queryFn: () => api.taskSubmissions(taskId) });
  const reviewsQ = useQuery({ queryKey: ['task-reviews', taskId], queryFn: () => api.taskReviews(taskId) });

  const task = taskQ.data as InspectionTask | undefined;
  const subs = (subsQ.data ?? []) as TaskSubmission[];
  const reviews = (reviewsQ.data ?? []) as TaskReviewRecord[];

  async function act(action: 'DISPATCH' | 'APPROVE' | 'REJECT' | 'CANCEL', opts?: { comment?: string }) {
    setError('');
    setBusy(action);
    try {
      await api.taskAction(taskId, action, opts);
      setRejecting(false);
      setComment('');
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['task-subs', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['task-reviews', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    ]);
  }

  return (
    <Drawer open onClose={onClose} width={560}
      title={task?.title ?? '任务详情'}
      subtitle={task ? `${task.taskId} · ${reachName(task.reachId)}` : ''}
      footer={
        task && <TaskActions task={task} busy={busy} rejecting={rejecting}
          comment={comment} setComment={setComment}
          onRejectMode={() => setRejecting(true)}
          onCancelReject={() => { setRejecting(false); setComment(''); }}
          onAct={act} />
      }>
      {taskQ.isLoading ? (
        <div className="tw-tiny">加载中…</div>
      ) : !task ? (
        <EmptyState title="任务不存在" />
      ) : (
        <div className="tw-stack" style={{ gap: 16 }}>
          <div className="tw-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Tag tone={task.status === 'APPROVED' ? 'ok' : task.status === 'CANCELLED' ? 'muted' : 'watch'}>
              {TASK_STATUS_CN[task.status] ?? task.status}
            </Tag>
            {task.latestVersion ? <Tag tone="outline">已提交 {task.latestVersion} 版</Tag> : null}
            {task.assignee && <span className="tw-tiny">指派人 {task.assignee}</span>}
            {task.eventId && <span className="tw-tiny">事件 {task.eventId}</span>}
          </div>
          {task.reason && <div className="tw-small muted">派发理由：{task.reason}</div>}
          {task.latestReview && (
            <div className="tw-rec-item">
              <div className="tw-row-between">
                <span className="tw-rec-title">
                  最近复核：{task.latestReview.decision === 'APPROVED' ? '通过' : '退回'}
                </span>
                <span className="tw-tiny">{formatTime(task.latestReview.reviewedAt)}</span>
              </div>
              {task.latestReview.comment && <div className="tw-rec-reason">{task.latestReview.comment}</div>}
            </div>
          )}
          {error && <div style={{ color: 'var(--tw-danger)', fontSize: 12.5 }}>{error}</div>}

          <div>
            <div className="tw-section-title">提交版本（{subs.length}）</div>
            {subs.length === 0 ? (
              <div className="tw-tiny">现场尚未提交。</div>
            ) : (
              [...subs].reverse().map((s) => (
                <div key={s.submissionId} className="tw-sub-card">
                  <div className="tw-row-between">
                    <b style={{ color: 'var(--tw-primary-800)' }}>v{s.version}</b>
                    <div className="tw-row" style={{ gap: 6 }}>
                      <Tag tone={s.conclusion === 'NORMAL' ? 'ok' : s.conclusion === 'ABNORMAL' ? 'danger' : 'watch'}>
                        {CONCLUSION_CN[s.conclusion] ?? s.conclusion}
                      </Tag>
                      {s.supersededAt && <Tag tone="muted">已退回归档</Tag>}
                      <span className="tw-tiny">{formatTime(s.submittedAt)}</span>
                    </div>
                  </div>
                  <div className="tw-small" style={{ marginTop: 4 }}>{s.observationNote}</div>
                  {s.attachmentIds.length > 0 && (
                    <div className="tw-tiny" style={{ marginTop: 4 }}>照片 {s.attachmentIds.length} 张：{s.attachmentIds.join(', ')}</div>
                  )}
                </div>
              ))
            )}
          </div>

          <div>
            <div className="tw-section-title">复核记录（{reviews.length}）</div>
            {reviews.length === 0 ? (
              <div className="tw-tiny">暂无 PC 复核记录。</div>
            ) : (
              reviews.map((r) => (
                <div key={r.reviewId} className="tw-sub-card">
                  <div className="tw-row-between">
                    <Tag tone={r.decision === 'APPROVED' ? 'ok' : 'danger'}>
                      {r.decision === 'APPROVED' ? '通过' : '退回补充'}
                    </Tag>
                    <span className="tw-tiny">v{r.version} · {r.reviewer} · {formatTime(r.reviewedAt)}</span>
                  </div>
                  {r.comment && <div className="tw-small" style={{ marginTop: 4 }}>{r.comment}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function TaskActions({
  task, busy, rejecting, comment, setComment, onRejectMode, onCancelReject, onAct,
}: {
  task: InspectionTask;
  busy: string | null;
  rejecting: boolean;
  comment: string;
  setComment: (s: string) => void;
  onRejectMode: () => void;
  onCancelReject: () => void;
  onAct: (a: 'DISPATCH' | 'APPROVE' | 'REJECT' | 'CANCEL', opts?: { comment?: string }) => void;
}) {
  return (
    <div className="tw-stack" style={{ gap: 8, width: '100%' }}>
      {rejecting && (
        <textarea className="tw-wb-reason" placeholder="退回原因（必填）" value={comment}
          onChange={(e) => setComment(e.target.value)} />
      )}
      <div className="tw-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        {task.status === 'DRAFT' && (
          <Button disabled={busy !== null} onClick={() => onAct('DISPATCH')}>
            {busy === 'DISPATCH' ? '派发中…' : '派发任务'}
          </Button>
        )}
        {task.status === 'SUBMITTED' && !rejecting && (
          <>
            <Button variant="danger" disabled={busy !== null} onClick={onRejectMode}>退回补充</Button>
            <Button disabled={busy !== null} onClick={() => onAct('APPROVE')}>
              {busy === 'APPROVE' ? '处理中…' : '复核通过'}
            </Button>
          </>
        )}
        {task.status === 'SUBMITTED' && rejecting && (
          <>
            <Button variant="ghost" onClick={onCancelReject}>取消</Button>
            <Button variant="danger" disabled={busy !== null || !comment.trim()}
              onClick={() => onAct('REJECT', { comment })}>
              {busy === 'REJECT' ? '提交中…' : '确认退回'}
            </Button>
          </>
        )}
        {!['APPROVED', 'CANCELLED', 'SUBMITTED', 'DRAFT'].includes(task.status) && (
          <Button variant="ghost" disabled={busy !== null} onClick={() => onAct('CANCEL')}>取消任务</Button>
        )}
      </div>
    </div>
  );
}

export const TASK_STATUS_CN: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待接收',
  ACCEPTED: '已接收',
  IN_PROGRESS: '进行中',
  SUBMITTED: '待复核',
  APPROVED: '已完成',
  CANCELLED: '已取消',
};

export default TaskDetailDrawer;
