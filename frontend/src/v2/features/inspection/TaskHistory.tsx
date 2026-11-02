import type { InspectionTask } from './inspectionTypes';
import type { Station } from '../../types';
import { Panel } from '../../components/ui/Panel';
import { TASK_STATUS_KEY } from './meta';

interface TaskHistoryProps {
  tasks: InspectionTask[];
  stations: Station[];
  onOpenTask: (id: string) => void;
}

export function TaskHistory({ tasks, stations, onOpenTask }: TaskHistoryProps) {
  return (
    <Panel
      code="02"
      title="任务记录"
      en="TASK HISTORY"
      className="v2-history-panel"
      bodyClassName="history-panel__body"
    >
      <div className="v2-task-table-wrap">
        <table className="v2-task-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>任务</th>
              <th>断面</th>
              <th>执行人</th>
              <th>时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const station = stations.find((s) => s.id === task.stationId);
              return (
                <tr
                  key={task.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`查看任务 ${task.title}`}
                  onClick={() => onOpenTask(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenTask(task.id);
                    }
                  }}
                >
                  <td className="v2-mono">{task.id}</td>
                  <td className="v2-task-table__title">{task.title}</td>
                  <td>{station?.name.replace(' 断面', '')}</td>
                  <td>{task.assignee}</td>
                  <td className="v2-mono">{task.submittedAt ?? task.dueAt}</td>
                  <td>
                    <span
                      className={`v2-table-status v2-table-status--${TASK_STATUS_KEY[task.status]}`}
                    >
                      {task.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
