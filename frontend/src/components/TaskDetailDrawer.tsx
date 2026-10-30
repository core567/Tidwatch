import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Button, Drawer, EmptyState, Modal, Tag } from '@/components/ui';
import { formatTime, reachName } from '@/components/EventBits';
import { SIM_METRIC_LABEL, SIM_METRIC_UNIT, simMetricName } from '@/lib/metrics';
import type { InspectionTask, TaskSubmission, TaskReviewRecord } from '@/types/contract';
import './TaskDetailDrawer.css';

const CONCLUSION_CN: Record<string, { text: string; tone: 'ok' | 'danger' | 'watch' }> = {
  NORMAL: { text: '未见明显异常', tone: 'ok' },
  ABNORMAL: { text: '发现异常', tone: 'danger' },
  UNCERTAIN: { text: '无法确认', tone: 'watch' },
};

interface SubmissionMeasure {
  metric: string;
  value: number | null;
  unit?: string;
  sourceType?: string;
  unmeasuredReason?: string;
}

const PRIORITY_CN: Record<string, string> = { HIGH: '高', NORMAL: '中', LOW: '低' };

function statusTag(status: string) {
  const map: Record<string, { text: string; tone: 'ok' | 'watch' | 'danger' | 'muted' }> = {
    DRAFT: { text: '草稿', tone: 'muted' },
    PENDING: { text: '待接收', tone: 'danger' },
    ACCEPTED: { text: '已接收', tone: 'watch' },
    IN_PROGRESS: { text: '进行中', tone: 'watch' },
    SUBMITTED: { text: '待复核', tone: 'watch' },
    APPROVED: { text: '已完成', tone: 'ok' },
    CANCELLED: { text: '已取消', tone: 'muted' },
  };
  const m = map[status] ?? { text: status, tone: 'muted' as const };
  return <Tag tone={m.tone}>{m.text}</Tag>;
}

/** 单张现场照片：真实 <img>，失败显示错误与重试，不使用占位图冒充。 */
function EvidencePhoto({ attachmentId, onOpen }: { attachmentId: string; onOpen: (index: number) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const url = api.attachmentUrl(attachmentId);

  return (
    <div className="rv-photo">
      {failed ? (
        <button type="button" className="rv-photo-retry" onClick={() => { setFailed(false); setAttempt((a) => a + 1); }}>
          加载失败<span>点击重试</span>
        </button>
      ) : (
        <img
          key={attempt}
          src={url}
          alt={`现场照片 ${attachmentId}`}
          loading="lazy"
          onError={() => setFailed(true)}
          onClick={() => onOpen(0)}
        />
      )}
    </div>
  );
}

/** PC 巡检任务宽抽屉复核工作台：概况 / 测量 / 照片 / 观察结论 / 版本历史 + 复核操作。 */
export function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [error, setError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const taskQ = useQuery({ queryKey: ['task', taskId], queryFn: () => api.task(taskId) });
  const subsQ = useQuery({ queryKey: ['task-subs', taskId], queryFn: () => api.taskSubmissions(taskId) });
  const reviewsQ = useQuery({ queryKey: ['task-reviews', taskId], queryFn: () => api.taskReviews(taskId) });

  const task = taskQ.data as InspectionTask | undefined;
  const subs = useMemo(() => [...((subsQ.data ?? []) as TaskSubmission[])].sort((a, b) => a.version - b.version), [subsQ.data]);
  const reviews = (reviewsQ.data ?? []) as TaskReviewRecord[];
  const reviewByVersion = useMemo(() => {
    const m = new Map<number, TaskReviewRecord>();
    reviews.forEach((r) => m.set(r.version, r));
    return m;
  }, [reviews]);

  // 最新一条复核（任务快照口径，含退回意见）
  const latestReview = [...reviews].sort((a, b) => (a.reviewedAt < b.reviewedAt ? 1 : -1))[0];
  const rejectedNow = task?.status === 'IN_PROGRESS' && latestReview?.decision === 'REJECTED';
  // 待 PC 复核的版本（SUBMITTED 时为最大版本号提交）
  const pendingSub = task?.status === 'SUBMITTED' ? subs[subs.length - 1] : undefined;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['task-subs', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['task-reviews', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    ]);
  }

  // 真正调用动作；成功关闭弹窗，失败保留弹窗并显示真实错误（不伪造成功）
  async function doReject() {
    const comment = rejectComment.trim();
    if (!comment || busy) return;
    setError('');
    setBusy('REJECT');
    try {
      await api.taskAction(taskId, 'REJECT', { comment });
      setRejectOpen(false);
      setRejectComment('');
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function doApprove() {
    if (busy) return;
    setError('');
    setBusy('APPROVE');
    try {
      await api.taskAction(taskId, 'APPROVE');
      setApproveOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openVersionPhotos(version: number) {
    const s = subs.find((x) => x.version === version);
    if (s && s.attachmentIds.length) {
      setLightbox({ urls: s.attachmentIds.map((id) => api.attachmentUrl(id)), index: 0 });
    }
  }

  // 灯箱左右切换 + Esc 关闭
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((lb) => (lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : lb));
      if (e.key === 'ArrowLeft') setLightbox((lb) => (lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : lb));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const canReview = task?.status === 'SUBMITTED';

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="clamp(620px, 60vw, 960px)"
        title={task?.title ?? '任务复核'}
        subtitle={task ? `${task.taskId} · ${reachName(task.reachId)}` : ''}
        footer={
          task ? (
            <div className="rv-foot">
              <div className="rv-foot-state">
                {statusTag(task.status)}
                {task.latestVersion ? <span className="rv-foot-sub">已提交 {task.latestVersion} 版</span> : null}
                {rejectedNow && <span className="rv-foot-reject">最近一次被退回，待现场重新提交</span>}
              </div>
              <div className="rv-foot-actions">
                {canReview ? (
                  <>
                    <Button variant="danger" disabled={busy !== null} onClick={() => { setError(''); setRejectOpen(true); }}>退回补充</Button>
                    <Button disabled={busy !== null} onClick={() => { setError(''); setApproveOpen(true); }}>
                      {busy === 'APPROVE' ? '处理中…' : '复核通过'}
                    </Button>
                  </>
                ) : (
                  <span className="rv-foot-hint">
                    {task.status === 'APPROVED' ? '该任务已复核完成' : task.status === 'CANCELLED' ? '任务已取消' : '任务尚未提交，待现场提交后复核'}
                  </span>
                )}
              </div>
            </div>
          ) : null
        }
      >
        {taskQ.isLoading ? (
          <div className="rv-loading">任务加载中…</div>
        ) : taskQ.isError ? (
          <EmptyState title="任务加载失败" description={taskQ.error instanceof Error ? taskQ.error.message : '请重试'} />
        ) : !task ? (
          <EmptyState title="任务不存在" />
        ) : (
          <div className="rv-body">
            {error && <div className="rv-error-banner">{error}</div>}

            {/* 区域 A：任务概况 */}
            <section className="rv-section">
              <h4 className="rv-h">任务概况</h4>
              <div className="rv-info-grid">
                <Info label="任务编号" value={<code>{task.taskId}</code>} />
                <Info label="当前状态" value={statusTag(task.status)} />
                <Info label="监测断面" value={reachName(task.reachId)} />
                <Info label="优先级" value={PRIORITY_CN[task.priority] ?? task.priority} />
                <Info label="负责人" value={task.assignee ?? '未指派'} />
                <Info label="关联事件" value={task.eventId ? <code>{task.eventId}</code> : '无（独立任务）'} />
                <Info label="创建时间" value={formatTime(task.createdAt)} />
                <Info label="最近提交" value={pendingSub || subs.length ? formatTime((pendingSub ?? subs[subs.length - 1]).submittedAt) : '—'} />
              </div>
              {task.reason && (
                <div className="rv-reason-box">
                  <span className="rv-reason-label">派发原因</span>
                  <span>{task.reason}</span>
                </div>
              )}
            </section>

            {/* 区域 E：提交版本与复核历史（每版本自带测量/照片/结论，不混用证据） */}
            <section className="rv-section">
              <h4 className="rv-h">现场提交与复核（{subs.length} 版）</h4>
              {subs.length === 0 ? (
                <div className="rv-empty-box">现场尚未提交反馈。</div>
              ) : (
                <div className="rv-versions">
                  {subs.map((s) => {
                    const review = reviewByVersion.get(s.version);
                    const measures = (s.measurements ?? []) as SubmissionMeasure[];
                    const isPending = !!pendingSub && s.version === pendingSub.version;
                    return (
                      <article key={s.submissionId} className={`rv-version ${isPending ? 'is-pending' : ''}`}>
                        <header className="rv-version-head">
                          <div className="rv-version-title">
                            <b>v{s.version}</b>
                            {(() => {
                              const c = CONCLUSION_CN[s.conclusion];
                              return <Tag tone={c?.tone ?? 'watch'}>{c?.text ?? s.conclusion}</Tag>;
                            })()}
                            {isPending && <Tag tone="danger">待复核</Tag>}
                            {review?.decision === 'REJECTED' && <Tag tone="danger">已退回</Tag>}
                            {review?.decision === 'APPROVED' && <Tag tone="ok">复核通过</Tag>}
                          </div>
                          <span className="rv-version-meta">{s.submittedBy} · {formatTime(s.submittedAt)}</span>
                        </header>

                        {/* 区域 B：现场测量数据（真实提交值；未测显式标注原因，无数据不编造） */}
                        <div className="rv-measure-title">现场测量数据</div>
                        {measures.length === 0 ? (
                          <div className="rv-measure-empty">本版本未提交结构化测量项。</div>
                        ) : (
                          <div className="rv-measure-grid">
                            {measures.map((m, i) => {
                              const label = SIM_METRIC_LABEL[m.metric] ?? simMetricName(m.metric);
                              const unit = m.unit ?? SIM_METRIC_UNIT[m.metric] ?? '';
                              const unmeasured = m.value === null || m.value === undefined;
                              return (
                                <div key={`${m.metric}-${i}`} className={`rv-measure ${unmeasured ? 'is-na' : ''}`}>
                                  <div className="rv-measure-k">{label}</div>
                                  {unmeasured ? (
                                    <div className="rv-measure-na">未测</div>
                                  ) : (
                                    <div className="rv-measure-v">
                                      {m.value}
                                      <span className="rv-measure-u">{unit}</span>
                                    </div>
                                  )}
                                  <div className="rv-measure-foot">
                                    {unmeasured ? (m.unmeasuredReason || '原因未填') : (m.sourceType === 'MANUAL' ? '人工现场测量' : (m.sourceType ?? '实测'))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 区域 C：现场照片证据（缩略图 + 灯箱，失败可重试） */}
                        <div className="rv-photo-title">
                          现场照片（{s.attachmentIds.length}）
                        </div>
                        {s.attachmentIds.length === 0 ? (
                          <div className="rv-photo-empty">本版本无照片。</div>
                        ) : (
                          <div className="rv-photo-grid">
                            {s.attachmentIds.map((id, idx) => (
                              <EvidencePhoto
                                key={id}
                                attachmentId={id}
                                onOpen={() => setLightbox({ urls: s.attachmentIds.map((x) => api.attachmentUrl(x)), index: idx })}
                              />
                            ))}
                          </div>
                        )}
                        {s.attachmentIds.length > 1 && (
                          <button type="button" className="rv-photo-all" onClick={() => openVersionPhotos(s.version)}>
                            大图浏览全部 {s.attachmentIds.length} 张
                          </button>
                        )}

                        {/* 区域 D：现场观察与结论 */}
                        <div className="rv-note-box">
                          <div className="rv-note-label">现场观察记录</div>
                          <div className="rv-note-text">{s.observationNote || '（未填写）'}</div>
                        </div>

                        {/* 该版本对应复核意见（按 version 精确关联） */}
                        {review && (
                          <div className={`rv-review ${review.decision === 'APPROVED' ? 'is-ok' : 'is-reject'}`}>
                            <div className="rv-review-head">
                              <b>{review.decision === 'APPROVED' ? '复核通过意见' : '退回意见'}</b>
                              <span>{review.reviewer} · {formatTime(review.reviewedAt)}</span>
                            </div>
                            {review.comment && <div className="rv-review-comment">{review.comment}</div>}
                          </div>
                        )}
                        {!review && task.status !== 'SUBMITTED' && (
                          <div className="rv-review rv-review-none">该版本尚未产生复核记录。</div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* 退回补充：居中弹窗，原因必填 */}
      <Modal
        open={rejectOpen}
        onClose={() => (busy ? undefined : setRejectOpen(false))}
        title="退回补充"
        subtitle={pendingSub ? `将退回 v${pendingSub.version}，任务回到「进行中」等待现场重新提交` : '任务将回到「进行中」'}
        width={480}
        footer={
          <>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setRejectOpen(false)}>取消</Button>
            <Button variant="danger" disabled={busy !== null || !rejectComment.trim()} onClick={doReject}>
              {busy === 'REJECT' ? '提交中…' : '确认退回'}
            </Button>
          </>
        }
      >
        {error && <div className="rv-error-banner">{error}</div>}
        <textarea
          className="rv-reject-input"
          placeholder="请填写退回原因（必填），将展示给现场巡检人员"
          value={rejectComment}
          maxLength={500}
          onChange={(e) => setRejectComment(e.target.value)}
          autoFocus
        />
        <div className="rv-reject-count">{rejectComment.length}/500</div>
      </Modal>

      {/* 复核通过：简洁确认，展示当前版本关键证据 */}
      <Modal
        open={approveOpen}
        onClose={() => (busy ? undefined : setApproveOpen(false))}
        title="确认复核通过"
        subtitle={pendingSub ? `审核第 v${pendingSub.version} 次提交` : ''}
        width={480}
        footer={
          <>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setApproveOpen(false)}>再看看</Button>
            <Button disabled={busy !== null} onClick={doApprove}>{busy === 'APPROVE' ? '处理中…' : '确认通过'}</Button>
          </>
        }
      >
        {error && <div className="rv-error-banner">{error}</div>}
        {pendingSub && (
          <div className="rv-confirm-ev">
            <div className="rv-confirm-row"><span>现场结论</span><b>{CONCLUSION_CN[pendingSub.conclusion]?.text ?? pendingSub.conclusion}</b></div>
            <div className="rv-confirm-row"><span>测量项</span><b>{((pendingSub.measurements ?? []) as SubmissionMeasure[]).length} 项</b></div>
            <div className="rv-confirm-row"><span>现场照片</span><b>{pendingSub.attachmentIds.length} 张</b></div>
            <div className="rv-confirm-row"><span>提交人 / 时间</span><b>{pendingSub.submittedBy} · {formatTime(pendingSub.submittedAt)}</b></div>
            {pendingSub.observationNote && <div className="rv-confirm-note">{pendingSub.observationNote}</div>}
          </div>
        )}
        <p className="rv-confirm-tip">通过后任务进入「已完成」。此操作遵循后端任务状态机，不可在小程序端撤销。</p>
      </Modal>

      {/* 大图灯箱：多图左右切换 */}
      {lightbox && (
        <div className="rv-lightbox" onClick={() => setLightbox(null)}>
          <button className="rv-lb-close" aria-label="关闭">×</button>
          {lightbox.urls.length > 1 && (
            <>
              <button className="rv-lb-prev" aria-label="上一张" onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.urls.length) % lightbox.urls.length }); }}>‹</button>
              <button className="rv-lb-next" aria-label="下一张" onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.urls.length }); }}>›</button>
              <div className="rv-lb-count" onClick={(e) => e.stopPropagation()}>{lightbox.index + 1} / {lightbox.urls.length}</div>
            </>
          )}
          <img src={lightbox.urls[lightbox.index]} alt="现场照片大图" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rv-info">
      <div className="rv-info-k">{label}</div>
      <div className="rv-info-v">{value}</div>
    </div>
  );
}

export default TaskDetailDrawer;
