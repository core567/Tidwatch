import type { SystemStatus } from '../../types';
import { Panel } from '../../components/ui/Panel';
import { Icon } from '../../components/ui/Icon';
import { Link } from 'react-router-dom';

export function SystemPulse({ system }: { system: SystemStatus }) {
  return (
    <Panel
      code="08"
      title="系统脉搏"
      en="SYSTEM PULSE"
      className="v2-pulse-panel"
      bodyClassName="v2-pulse-panel__body"
      actions={
        <Link to="/admin" className="v2-panel-link" aria-label="查看系统管理">
          <Icon name="arrow-up-right" size={13} />
        </Link>
      }
    >
      <div className="v2-pulse-hero">
        <div>
          <span className="v2-pulse-hero__label">BACKEND STATUS</span>
          <div className="v2-pulse-hero__value">
            <b className="v2-mono">
              {system.backend.online ? 'ONLINE' : 'DEGRADED'}
            </b>
            <span>{system.backend.latencyMs !== null ? `${system.backend.latencyMs} ms` : '实时状态'}</span>
          </div>
        </div>
        <div className="v2-pulse-bars" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>

      <div className="v2-pulse-sources">
        {system.sources.map((source) => (
          <div className="v2-source-row" key={source.name}>
            <span
              className={`v2-status-dot ${source.online ? '' : 'v2-status-dot--idle'}`}
              style={{ width: 5, height: 5 }}
            />
            <span className="v2-source-row__main">
              <span className="v2-source-row__name">{source.name}</span>
              <span className="v2-source-row__note">{source.note}</span>
            </span>
            <span className="v2-source-row__latency v2-mono">{source.latency}</span>
          </div>
        ))}
      </div>

      <div className="v2-pulse-foot">
        <span className="v2-mono">更新于 {system.updatedAt}</span>
      </div>
    </Panel>
  );
}
