import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Button, Card, Drawer, Tag } from '@/components/ui';
import { reachName } from '@/components/EventBits';
import { EVENT_ACTION_LABEL } from '@/lib/eventActions';
import type { EventAction, Recommendation } from '@/types/contract';

/**
 * 规则处置建议（非 AI）。
 * - EVENT_ACTION：在底部流程条/操作区执行（这里仅展示）
 * - TASK（DISPATCH_FIELD_CHECK）：弹出抽屉，用户确认后才派发
 */
export function RecommendationsCard({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dispatch, setDispatch] = useState<Recommendation | null>(null);

  const q = useQuery({
    queryKey: ['event-recs', eventId],
    queryFn: () => api.eventRecommendations(eventId),
    refetchInterval: 30000,
  });
  const items = q.data?.items ?? [];

  return (
    <Card
      title="处置建议"
      subtitle="确定性规则生成（非 AI），仅作建议不自动执行"
      actions={<Tag tone="muted">{q.data?.ruleVersion ?? '—'}</Tag>}
    >
      {items.length === 0 ? (
        <div className="tw-tiny">当前状态暂无额外建议。</div>
      ) : (
        <div className="tw-stack" style={{ gap: 10 }}>
          {items.map((r) => (
            <div key={r.code} className="tw-rec-item">
              <div className="tw-row-between">
                <span className="tw-rec-title">{r.title}</span>
                <Tag tone={r.priority === 'HIGH' ? 'danger' : r.priority === 'LOW' ? 'muted' : 'watch'}>
                  {r.priority === 'HIGH' ? '高优先' : r.priority === 'LOW' ? '低' : '常规'}
                </Tag>
              </div>
              <div className="tw-rec-reason">{r.reason}</div>
              <div className="tw-row" style={{ marginTop: 6, gap: 8 }}>
                {r.category === 'TASK' && r.suggestedTask && (
                  <Button size="sm" onClick={() => setDispatch(r)}>执行（派发任务）</Button>
                )}
                {r.category === 'EVENT_ACTION' && r.eventAction && (
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/events/${eventId}/workbench`)}>
                    {EVENT_ACTION_LABEL[r.eventAction as EventAction] ?? r.eventAction}
                  </Button>
                )}
                {r.code === 'REVIEW_SUBMISSION' && (
                  <Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>去复核</Button>
                )}
                {(r.reachIds?.length ?? 0) > 0 && (
                  <span className="tw-tiny">{r.reachIds!.map(reachName).join('、')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dispatch && (
        <DispatchDrawer
          open
          rec={dispatch}
          eventId={eventId}
          onClose={() => setDispatch(null)}
          onDone={() => {
            setDispatch(null);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['business-timeline'] });
            queryClient.invalidateQueries({ queryKey: ['event-recs', eventId] });
          }}
        />
      )}
    </Card>
  );
}

function DispatchDrawer({
  open,
  rec,
  eventId,
  onClose,
  onDone,
}: {
  open: boolean;
  rec: Recommendation;
  eventId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const reachId = rec.suggestedTask?.reachId ?? rec.reachIds?.[0] ?? 'reach-a';
  const [title, setTitle] = useState(`现场核查 ${reachName(reachId)}`);
  const [reason, setReason] = useState(rec.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (title.trim().length < 2) {
      setError('任务标题至少 2 个字符');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.createTask({
        eventId,
        reachId,
        title: title.trim(),
        reason: reason.trim(),
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} title="派发现场核查" subtitle="AI/规则仅生成草稿，需人工确认后创建" onClose={onClose} footer={
      <>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={submit} disabled={busy}>{busy ? '派发中…' : '确认派发'}</Button>
      </>
    }>
      <div className="tw-stack" style={{ gap: 12 }}>
        <label className="tw-field">
          <span>关联事件</span>
          <input value={eventId} disabled />
        </label>
        <label className="tw-field">
          <span>目标断面</span>
          <input value={reachName(reachId)} disabled />
        </label>
        <label className="tw-field">
          <span>任务标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="tw-field">
          <span>派发理由</span>
          <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <div style={{ color: 'var(--tw-danger)', fontSize: 12.5 }}>{error}</div>}
        <div className="tw-tiny">创建后任务为 PENDING（待派发/待接收），可在巡检协同中心或小程序接收执行。</div>
      </div>
    </Drawer>
  );
}

export default RecommendationsCard;
