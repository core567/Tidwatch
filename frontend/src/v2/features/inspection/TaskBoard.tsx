import type { InspectionTask, TaskStatus } from './inspectionTypes';
import type { Station } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { PRIORITY_KEY, TASK_STATUS_KEY } from './meta';

const columns: { status: TaskStatus; label: string; tone: string }[] = [
  { status: '待派发', label: '待派发', tone: 'pending' },
  { status: '进行中', label: '进行中', tone: 'active' },
  { status: '待复核', label: '待复核', tone: 'review' },
  { status: '已归档', label: '已归档', tone: 'closed' },
];

interface TaskBoardProps {
  tasks: InspectionTask[];
  stations: Station[];
  memberFilter: string | null;
  onClearFilter: () => void;
  onOpenTask: (id: string) => void;
}

export function TaskBoard({
  tasks,
  stations,
  memberFilter,
  onClearFilter,
  onOpenTask,
}: TaskBoardProps) {
  return (
    <Panel
      code="01"
      title="任务看板"
      en="FIELD BOARD"
      className="v2-board-panel"
      actions={
        memberFilter ? (
          <button type="button" className="v2-board-filter" onClick={onClearFilter}>
            仅看 {memberFilter}
            <Icon name="close" size={11} />
          </button>
        ) : null
      }
    >
      <div
        className="v2-task-board"
        data-filled={columns.filter((c) => tasks.some((task) => task.status === c.status)).length}
      >
        {columns.map((column, index) => {
          const items = tasks.filter((task) => task.status === column.status);
          return (
            <div className="v2-board-col" key={column.status}>
              <header className="v2-board-col__head">
                <span className={`v2-board-col__dot v2-board-col__dot--${column.tone}`} />
                <b>{column.label}</b>
                <em className="v2-mono">{String(items.length).padStart(2, '0')}</em>
              </header>
              <div className="v2-board-col__cards">
                {items.map((task) => {
                  const station = stations.find((s) => s.id === task.stationId);
                  const t2 = task as typeof task & { latestVersion?: number | null; originalStatusCn?: string; eventId?: string | null; time?: string };
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={`v2-task-card v2-task-card--${TASK_STATUS_KEY[task.status]}`}
                      onClick={() => onOpenTask(task.id)}
                    >
                      <span className="v2-task-card__top">
                        <span className="v2-task-card__id v2-mono" title={task.id}>{task.id.length > 12 ? `${task.id.slice(0, 12)}…` : task.id}</span>
                        <span
                          className={`v2-task-card__prio v2-task-card__prio--${PRIORITY_KEY[task.priority]}`}
                        >
                          {task.priority}优先
                        </span>
                      </span>
                      <span className="v2-task-card__title">{task.title}</span>
                      <span className="v2-task-card__meta">
                        <span className="v2-task-card__station">
                          {station?.name.replace(' 断面', '')}
                        </span>
                        <span className="v2-task-card__assignee">
                          <i className={task.assignee === '未指派' ? 'v2-is-empty' : ''}>
                            {task.assignee === '未指派' ? '+' : task.assignee.slice(0, 1)}
                          </i>
                          {task.assignee}
                        </span>
                      </span>
                      <span className="v2-task-card__progress">
                        {t2.latestVersion ? (
                          <i style={{ width: '100%' }} />
                        ) : null}
                      </span>
                      <span className="v2-task-card__foot">
                        <span className="v2-mono">
                          {t2.latestVersion ? `已提交 v${t2.latestVersion}` : t2.originalStatusCn ?? ''}
                        </span>
                        <span className="v2-mono">
                          {t2.eventId ? `关联事件 ${t2.eventId}` : '独立任务'} · {t2.time ?? ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {items.length === 0 && (
                  <div className="v2-board-col__empty">
                    <Icon name="wave" size={13} />
                    <span>暂无任务</span>
                  </div>
                )}
              </div>
              {index < columns.length - 1 && (
                <span className="v2-board-col__arrow" aria-hidden="true">
                  <Icon name="chevron-right" size={12} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
