import { Link } from 'react-router-dom';
import type { InspectionTask, Station } from '../../types';
import { Panel } from '../../components/ui/Panel';
import { Icon } from '../../components/ui/Icon';

const columns: { status: InspectionTask['status']; tone: string; label: string }[] = [
  { status: '待派发', tone: 'idle', label: '待派发' },
  { status: '进行中', tone: 'live', label: '进行中' },
  { status: '待复核', tone: 'warn', label: '待复核' },
];

const priorityTone: Record<InspectionTask['priority'], string> = {
  高: 'high',
  中: 'mid',
  低: 'low',
};

export function InspectionBoard({
  tasks,
  stations,
  completedCount = 0,
  demo = false,
}: {
  tasks: InspectionTask[];
  stations: Station[];
  /** 已完成（APPROVED）任务数：看板三列之外的真实闭环口径 */
  completedCount?: number;
  /** 演示模式：任务为内存模拟，不跳转真实任务页 */
  demo?: boolean;
}) {
  return (
    <Panel
      code="06"
      title="巡检任务"
      en="FIELD TASKS"
      className="v2-inspection-panel"
      bodyClassName="v2-inspection-panel__body"
      actions={
        demo ? (
          <span className="v2-panel-link" title="演示任务不进入真实任务页">
            全部任务 · SIMULATED
          </span>
        ) : (
          <Link to="/tasks" className="v2-panel-link">
            全部任务
            <Icon name="arrow-right" size={12} />
          </Link>
        )
      }
    >
      <div className="v2-kanban">
        {columns.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          return (
            <div className="v2-kanban__col" key={col.status}>
              <div className="v2-kanban__head">
                <span className={`v2-kanban__dot v2-kanban__dot--${col.tone}`} />
                {col.label}
                <b className="v2-mono">{String(items.length).padStart(2, '0')}</b>
              </div>
              <div className="v2-kanban__tasks">
                {items.map((task) => {
                  const station = stations.find((s) => s.id === task.stationId);
                  const card = (
                    <>
                      <div className="v2-task__top">
                        <span className="v2-task__id v2-mono">{task.id}</span>
                        <span className={`v2-task__prio v2-task__prio--${priorityTone[task.priority]}`}>
                          {task.priority}优先
                        </span>
                      </div>
                      <p className="v2-task__title">{task.title}</p>
                      <div className="v2-task__foot">
                        <span className="v2-task__station">
                          {station?.name.replace(' 断面', '') ?? task.stationId}
                        </span>
                        <span className="v2-task__assignee">
                          <i className={task.assignee === '未指派' ? 'v2-is-empty' : ''}>
                            {task.assignee === '未指派' ? '+' : task.assignee.slice(0, 1)}
                          </i>
                          {task.assignee}
                        </span>
                        <span className="v2-task__time v2-mono">{task.time}</span>
                      </div>
                    </>
                  );
                  return demo ? (
                    <div className="v2-task" key={task.id} title="演示任务 · 内存模拟">
                      {card}
                    </div>
                  ) : (
                    <Link to="/tasks" className="v2-task" key={task.id}>
                      {card}
                    </Link>
                  );
                })}
                {items.length === 0 && <div className="v2-kanban__empty">暂无任务</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="v2-kanban-foot">
        <span>
          <span className="v2-status-dot" style={{ width: 5, height: 5 }} />
          看板未闭环 {tasks.length} 项（近 12 项）
        </span>
        <span className="v2-mono">已完成 {completedCount} 项 · 口径与任务中心一致</span>
      </div>
    </Panel>
  );
}
