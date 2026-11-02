import { Link } from 'react-router-dom';
import type { AlertItem, StationId } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';

interface AlertRailProps {
  alerts: AlertItem[];
  /** 演示模式：预警为内存模拟事件，禁止跳转真实研判 */
  demo?: boolean;
}

function RiskScale({ level }: { level: AlertItem['risk'] }) {
  const lit = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <span className={`v2-risk-scale v2-risk-scale--${level}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < lit ? 'v2-is-lit' : ''} />
      ))}
    </span>
  );
}

const stationLabelOf: Record<StationId, string> = { A: '上游 A', B: '中游 B', C: '下游 C' };

export function AlertRail({ alerts, demo = false }: AlertRailProps) {
  const primary = alerts.find((alert) => alert.risk === 'high') ?? alerts[0];
  if (!primary) {
    return (
      <section className="v2-panel v2-alert-panel">
        <header className="v2-panel__head">
          <span className="v2-panel__code">02</span>
          <h2 className="v2-panel__title">当前预警</h2>
          <span className="v2-panel__en">ACTIVE ALERTS</span>
        </header>
        <div className="v2-panel__body v2-alert-panel__body">
          <p className="v2-muted" style={{ padding: 8 }}>
            当前无未闭环事件。
          </p>
        </div>
      </section>
    );
  }
  const rest = alerts.filter((alert) => alert.id !== primary.id);
  const workbenchOf = (id: string) => `/events/${encodeURIComponent(id)}/workbench`;
  const riskText = primary.risk === 'high' ? '高风险' : primary.risk === 'medium' ? '中风险' : '低风险';

  return (
    <section className="v2-panel v2-alert-panel">
      <header className="v2-panel__head">
        <span className="v2-panel__code">02</span>
        <h2 className="v2-panel__title">当前预警</h2>
        <span className="v2-panel__en">ACTIVE ALERTS</span>
        <div className="v2-panel__actions">
          <Badge tone="high">{String(alerts.length).padStart(2, '0')} ACTIVE</Badge>
        </div>
      </header>

      <div className="v2-panel__body v2-alert-panel__body">
        <article className="v2-alert-primary">
          <div className="v2-alert-primary__top">
            <Badge tone={primary.risk === 'high' ? 'high' : 'mid'}>
              {primary.riskCode} · {riskText}
            </Badge>
            <RiskScale level={primary.risk} />
            <span className="v2-alert-primary__station">
              <Icon name="analysis" size={12} />
              {stationLabelOf[primary.stationId]}
            </span>
            <span className="v2-alert-primary__time v2-mono">{primary.time}</span>
          </div>

          <h3 className="v2-alert-primary__title" title={primary.summary}>
            {primary.title}
          </h3>
          <p className="v2-alert-primary__desc">{primary.summary}</p>

          <div className="v2-alert-primary__reading">
            <span className="v2-alert-primary__metric-label">{primary.metricLabel}</span>
            <b className="v2-mono">{primary.metricValue}</b>
          </div>

          <div className="v2-alert-primary__foot">
            <span className="v2-alert-status">
              <span className="v2-status-dot v2-status-dot--danger" />
              {primary.status}
            </span>
            {demo ? (
              <span className="v2-btn v2-btn--primary v2-btn--sm v2-btn--disabled" title="演示事件无真实研判记录">
                进入研判
                <Icon name="arrow-right" size={13} className="v2-btn__arrow" />
              </span>
            ) : (
              <Link to={workbenchOf(primary.id)} className="v2-btn v2-btn--primary v2-btn--sm">
                进入研判
                <Icon name="arrow-right" size={13} className="v2-btn__arrow" />
              </Link>
            )}
          </div>
        </article>

        <div className="v2-alert-minor-list">
          {rest.map((alert) => {
            const inner = (
              <>
                <span className={`v2-alert-minor__bar v2-alert-minor__bar--${alert.risk}`} />
                <span className="v2-alert-minor__main">
                  <span className="v2-alert-minor__title">
                    {alert.title}
                    <span className="v2-alert-minor__time v2-mono">{alert.time}</span>
                  </span>
                  <span className="v2-alert-minor__meta">
                    {stationLabelOf[alert.stationId]} · {alert.status}
                  </span>
                </span>
                <Icon name="chevron-right" size={14} className="v2-alert-minor__chevron" />
              </>
            );
            return demo ? (
              <div key={alert.id} className="v2-alert-minor" title="演示事件无真实研判记录">
                {inner}
              </div>
            ) : (
              <Link to={workbenchOf(alert.id)} key={alert.id} className="v2-alert-minor">
                {inner}
              </Link>
            );
          })}
        </div>
      </div>

      <footer className="v2-panel__footer v2-alert-panel__footer">
        <Link to="/events" className="v2-panel-link">
          查看全部事件
          <Icon name="arrow-right" size={13} />
        </Link>
        <span className="v2-alert-panel__foot-meta">当前 · {alerts.length} 起未闭环</span>
      </footer>
    </section>
  );
}
