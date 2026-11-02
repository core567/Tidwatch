import type { InspectionTask, Inspector } from './inspectionTypes';
import { Panel } from '../../components/ui/Panel';

const memberStatusKey: Record<Inspector['status'], string> = {
  在岗: 'online',
  外勤: 'field',
  离线: 'offline',
};

interface MemberPanelProps {
  members: Inspector[];
  tasks: InspectionTask[];
  activeFilter: string | null;
  onFilter: (name: string | null) => void;
}

export function MemberPanel({ members, tasks, activeFilter, onFilter }: MemberPanelProps) {
  const online = members.filter((member) => member.status !== '离线').length;

  return (
    <Panel
      code="03"
      title="巡检人员"
      en="FIELD CREW"
      className="v2-crew-panel"
      footer={
        <span className="v2-crew-panel__foot">
          <span className="v2-status-dot" style={{ width: 5, height: 5 }} />
          在岗 {String(online).padStart(2, '0')} / {String(members.length).padStart(2, '0')}
          <span className="v2-crew-panel__hint">点击成员筛选任务</span>
        </span>
      }
    >
      <div className="v2-crew-list">
        {members.map((member) => {
          const load = tasks.filter(
            (task) => task.assignee === member.name && task.status !== '已归档',
          ).length;
          const active = activeFilter === member.name;
          return (
            <button
              key={member.id}
              type="button"
              className={`v2-crew-row ${active ? 'is-active' : ''}`.trim()}
              onClick={() => onFilter(active ? null : member.name)}
              aria-pressed={active}
            >
              <span className="v2-crew-avatar">{member.initials}</span>
              <span className="v2-crew-main">
                <b>{member.name}</b>
                <em>
                  {member.role} · {member.scope}
                </em>
              </span>
              <span className="v2-crew-load">
                <span className="v2-crew-load__bar">
                  <i style={{ width: `${Math.min(100, load * 34)}%` }} />
                </span>
                <em className="v2-mono">{load} 项</em>
              </span>
              <span className={`v2-crew-status v2-crew-status--${memberStatusKey[member.status]}`}>
                {member.status}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
