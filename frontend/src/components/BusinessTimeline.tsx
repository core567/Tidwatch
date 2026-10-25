import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { EmptyState, Tag } from '@/components/ui';
import { formatTime } from '@/components/EventBits';
import type { TimelineItem } from '@/types/contract';

const TYPE_TONE: Record<string, { label: string; tone: 'default' | 'ok' | 'watch' | 'danger' | 'muted' }> = {
  EVENT: { label: '事件', tone: 'watch' },
  TASK: { label: '任务', tone: 'default' },
  EVIDENCE: { label: '证据', tone: 'ok' },
  ASSESSMENT: { label: '评估', tone: 'muted' },
  BLINDSPOT: { label: '盲区', tone: 'danger' },
  SUBMISSION: { label: '回填', tone: 'default' },
  REVIEW: { label: '复核', tone: 'default' },
  ATTACHMENT: { label: '附件', tone: 'muted' },
  RECOVERY: { label: '恢复', tone: 'ok' },
};

const ACTION_CN: Record<string, string> = {
  'event.status-changed': '事件状态迁移',
  'task.created': '任务派发',
  'task.accepted': '任务接收',
  'task.started': '开始执行',
  'task.submitted': '现场回填',
  'task.cancelled': '任务取消',
  'task.dispatched': '任务派发',
  'evidence.added': '证据登记',
  'assessment.created': '再评估',
  'blindspot.opened': '盲区开启',
  'blindspot.resolved': '盲区解除',
  'attachment.uploaded': '照片上传',
  'recovery.assessed': '恢复评估',
};

function actionText(action: string): string {
  return ACTION_CN[action] ?? action;
}

function dotClass(biz: string): string {
  return ({
    EVENT: 'is-watch',
    TASK: '',
    EVIDENCE: 'is-ok',
    ASSESSMENT: 'is-muted',
    BLINDSPOT: 'is-danger',
  } as Record<string, string>)[biz] ?? '';
}

/** 统一业务时间线（business_events）。事件或任务二选一。 */
export function BusinessTimeline({
  eventId,
  taskId,
  height,
}: {
  eventId?: string;
  taskId?: string;
  height?: number;
}) {
  const q = useQuery({
    queryKey: ['business-timeline', eventId ?? taskId],
    queryFn: () =>
      eventId ? api.eventTimeline(eventId) : api.taskTimeline(taskId!),
    enabled: !!(eventId || taskId),
    refetchInterval: 10000,
  });

  if (q.isLoading) return <div className="tw-tiny" style={{ padding: 12 }}>时间线加载中…</div>;
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState title="暂无时间线记录" description="事件迁移、任务、证据等业务动作将在此留痕。" />;
  }

  return (
    <div className="tw-biz-timeline" style={height ? { maxHeight: height, overflowY: 'auto' } : undefined}>
      {items.map((it: TimelineItem) => {
        const meta = TYPE_TONE[it.bizType] ?? { label: it.bizType, tone: 'muted' as const };
        return (
          <div key={it.eventId} className="tw-biz-tl-item">
            <div className={`tw-biz-tl-dot ${dotClass(it.bizType)}`} />
            <div className="tw-biz-tl-body">
              <div className="tw-row-between">
                <span className="tw-biz-tl-title">{actionText(it.actionType)}</span>
                <Tag tone={meta.tone}>{meta.label}</Tag>
              </div>
              {it.description && <div className="tw-biz-tl-desc">{it.description}</div>}
              <div className="tw-row tw-tiny" style={{ marginTop: 3, gap: 6 }}>
                <span>{formatTime(it.occurredAt)}</span>
                {(it.fromStatus || it.toStatus) && (
                  <span>
                    {it.fromStatus ?? '—'} → <b>{it.toStatus}</b>
                  </span>
                )}
                <span>{it.actor}</span>
                {it.source === 'backfill' && <span>· 历史回填</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BusinessTimeline;
