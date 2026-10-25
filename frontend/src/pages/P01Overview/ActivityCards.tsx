import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, Tag } from '@/components/ui';
import { reachName, shortTime } from '@/components/EventBits';
import SourceTag from '@/components/SourceTag';
import { DISPOSAL_STEPS, disposalStage, latestOpenTask } from '@/lib/disposalStage';
import type { ActiveEvent, InspectionTask } from '@/types/contract';

const STEPS = DISPOSAL_STEPS;

export function EventProgressCard({
  events,
  tasks,
  loading,
}: {
  events: ActiveEvent[];
  tasks: InspectionTask[];
  loading?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <Card
      title="异常处置进度"
      subtitle="发现 → 研判 → 待派发 → 巡检中 → 待复核 → 已完成"
      padded={false}
      actions={
        <Button size="sm" variant="ghost" onClick={() => navigate('/events')}>
          全部事件
        </Button>
      }
    >
      {loading ? (
        <div className="state-box">加载中…</div>
      ) : events.length === 0 ? (
        <EmptyState
          title="当前无进行中的异常处置"
          description="规则识别到持续异常并生成事件后，将在此跟踪各事件的处置环节。"
        />
      ) : (
        <div>
          {events.slice(0, 5).map((e) => {
            const task = latestOpenTask(tasks, e.eventId);
            const stage = disposalStage(e, task);
            return (
              <button
                key={e.eventId}
                type="button"
                className="tw-pipeline-row"
                onClick={() => navigate(`/events/${e.eventId}/workbench`)}
              >
                <div className="tw-row-between" style={{ marginBottom: 8 }}>
                  <span className="tw-pipeline-title">{e.title}</span>
                  <span className="tw-tiny">{shortTime(e.firstSeenAt)}</span>
                </div>
                <div className="tw-pipeline">
                  {STEPS.map((label, i) => (
                    <div key={label} className="tw-pipeline-step-wrap">
                      <div
                        className={`tw-pipeline-step${i <= stage ? ' is-done' : ''}${i === stage ? ' is-current' : ''}`}
                      />
                      <span className={`tw-pipeline-label${i === stage ? ' is-current' : ''}${i < stage ? ' is-done' : ''}`}>
                        {label}
                      </span>
                      {i < STEPS.length - 1 && (
                        <span className={`tw-pipeline-bar${i < stage ? ' is-done' : ''}`} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="tw-row tw-tiny" style={{ marginTop: 8, gap: 6 }}>
                  <span>{reachName(e.scopeReachIds[0] ?? '')}</span>
                  {e.priority === 'HIGH' && <Tag tone="danger">高优先</Tag>}
                  {task ? <Tag tone="watch">关联任务 {taskStatusLabel(task.status)}</Tag> : <Tag tone="muted">尚未派发任务</Tag>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const CONCLUSION: Record<string, { text: string; tone: 'ok' | 'danger' | 'watch' }> = {
  NORMAL: { text: '复测正常', tone: 'ok' },
  ABNORMAL: { text: '复测异常', tone: 'danger' },
  UNCERTAIN: { text: '结论不确定', tone: 'watch' },
};

export function InspectionActivityCard({ tasks, loading }: { tasks: InspectionTask[]; loading?: boolean }) {
  const navigate = useNavigate();
  const rows = tasks
    .filter((t) => t.status !== 'CANCELLED')
    .sort((a, b) => {
      const ta = new Date(a.observedAt ?? a.completedAt ?? a.createdAt).getTime();
      const tb = new Date(b.observedAt ?? b.completedAt ?? b.createdAt).getTime();
      return tb - ta;
    })
    .slice(0, 6);

  return (
    <Card
      title="最新巡检动态"
      subtitle="现场反馈 / 复测结果 / 待复核 / 退回补充（退回环节在任务审核流程上线后出现）"
      padded={false}
      actions={
        <Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>
          全部任务
        </Button>
      }
    >
      {loading ? (
        <div className="state-box">加载中…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="暂无巡检动态"
          description="现场接收、执行、提交复测后将在此显示最新反馈。"
        />
      ) : (
        <div>
          {rows.map((t) => {
            const conclusion = t.resultConclusion ? CONCLUSION[t.resultConclusion] : undefined;
            return (
              <button
                key={t.taskId}
                type="button"
                className="tw-activity-row"
                onClick={() => navigate('/tasks')}
              >
                <div className="tw-row-between">
                  <span className="tw-pipeline-title">{t.title}</span>
                  <Tag tone={t.status === 'SUBMITTED' ? 'watch' : 'default'}>
                    {taskStatusLabel(t.status)}
                  </Tag>
                </div>
                <div className="tw-row tw-tiny" style={{ marginTop: 4, gap: 6 }}>
                  <span>{reachName(t.reachId)}</span>
                  {conclusion && <Tag tone={conclusion.tone}>{conclusion.text}</Tag>}
                  {t.attachmentIds.length > 0 && <span>照片 {t.attachmentIds.length}</span>}
                  {t.observedAt && <SourceTag source="MANUAL" />}
                </div>
                {t.resultNote && (
                  <div className="tw-activity-note" title={t.resultNote}>
                    {t.resultNote}
                  </div>
                )}
                <div className="tw-tiny" style={{ marginTop: 4, color: 'var(--tw-text-tertiary)' }}>
                  {t.observedAt
                    ? `现场反馈 ${shortTime(t.observedAt)}`
                    : `创建 ${shortTime(t.createdAt)}`}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function taskStatusLabel(status: InspectionTask['status']): string {
  return (
    {
      PENDING: '待接收',
      ACCEPTED: '已接收',
      IN_PROGRESS: '巡检中',
      SUBMITTED: '待复核',
      CANCELLED: '已取消',
    }[status] ?? status
  );
}
