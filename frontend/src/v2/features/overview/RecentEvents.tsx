import { Link } from 'react-router-dom';
import type { IncidentRecord, StationId } from '../../types';
import { Panel } from '../../components/ui/Panel';
import { Icon } from '../../components/ui/Icon';

export function RecentEvents({
  incidents,
  stationName,
  demo = false,
}: {
  incidents: IncidentRecord[];
  stationName: (id: StationId) => string;
  /** 演示模式：事件为内存模拟，不跳转真实研判 */
  demo?: boolean;
}) {
  return (
    <Panel
      code="07"
      title="近期事件"
      en="RECENT EVENTS"
      className="v2-events-panel"
      bodyClassName="v2-events-panel__body"
      actions={
        <Link to="/review" className="v2-panel-link">
          事件档案
          <Icon name="arrow-right" size={12} />
        </Link>
      }
    >
      <div className="v2-event-list">
        {incidents.length === 0 && <div className="v2-event-empty">暂无事件记录</div>}
        {incidents.map((incident) => {
          const row = (
            <>
              <span className="v2-event-row__time v2-mono">{incident.time}</span>
              <span className={`v2-event-row__mark v2-event-row__mark--${incident.risk}`} />
              <span className="v2-event-row__main">
                <span className="v2-event-row__title">{incident.title}</span>
                <span className="v2-event-row__meta">
                  {stationName(incident.stationId)} · {incident.id}
                </span>
              </span>
              <span className={`v2-event-row__status v2-event-row__status--${incident.risk}`}>
                {incident.status}
              </span>
            </>
          );
          return demo ? (
            <div className="v2-event-row" key={incident.id} title="演示事件 · 内存模拟">{row}</div>
          ) : (
            <Link
              to={`/events/${encodeURIComponent(incident.id)}/workbench`}
              className="v2-event-row"
              key={incident.id}
            >
              {row}
            </Link>
          );
        })}

      </div>
    </Panel>
  );
}
