import { Link } from 'react-router-dom';
import type { TwinStation } from './twinTypes';
import { Icon } from '../../components/ui/Icon';
import type { TwinView } from './types';

interface TwinStationHudProps {
  stations: TwinStation[];
  view: TwinView;
  location: string;
  updatedAt: string;
  open: boolean;
  onToggle: () => void;
  onViewChange: (view: TwinView) => void;
}

export function TwinStationHud({
  stations,
  view,
  location,
  updatedAt,
  open,
  onToggle,
  onViewChange,
}: TwinStationHudProps) {
  const station = view === 'overview' ? undefined : stations.find((s) => s.id === view);
  const attention = stations.filter((s) => s.tone !== 'good').length;

  if (!open) {
    return (
      <button
        type="button"
        className="v2-twin-hud-tab v2-twin-hud-tab--left"
        onClick={onToggle}
        aria-expanded={false}
        aria-controls="twin-station-hud"
      >
        <Icon name="inspection" size={14} />
        <span>{station ? `${station.id} 断面信息` : '断面信息'}</span>
      </button>
    );
  }

  return (
    <aside
      className="v2-twin-hud v2-twin-hud--left"
      id="twin-station-hud"
      aria-label="监测断面信息"
    >
      <header className="v2-twin-hud__head">
        <span className="v2-mono">{station ? `STATION ${station.id}` : 'RIVER SEGMENT'}</span>
        <span className={`v2-twin-panel-status v2-twin-panel-status--${station?.tone ?? 'alert'}`}>
          {station ? station.statusLabel : `${attention} 个断面需关注`}
        </span>
        <button
          type="button"
          className="v2-twin-hud__collapse"
          onClick={onToggle}
          aria-label="收起断面信息"
          aria-expanded
          aria-controls="twin-station-hud"
        >
          <Icon name="close" size={13} />
        </button>
      </header>

      <div className="v2-twin-hud__body">
        {station ? (
          <>
            <h2 className="v2-twin-info__title">{station.name}</h2>
            <div className="v2-twin-info__tags">
              <span>水质 {station.waterClass} 类</span>
              <span className="v2-mono">{station.riskCode}</span>
              <span>{station.statusLabel}</span>
            </div>
            <p className="v2-twin-info__summary">{station.summary}</p>
            <div className="v2-twin-info__meta">
              <span className="v2-mono">{station.coordinates}</span>
              <span>更新 {station.updatedAt}</span>
            </div>
            <Link to="/analysis" className="v2-twin-panel-link">
              查看水环境分析
              <Icon name="arrow-right" size={12} />
            </Link>
          </>
        ) : (
          <>
            <h2 className="v2-twin-info__title">{location}</h2>
            <p className="v2-twin-info__summary">
              干流断面总览。当前 {attention} 个断面处于关注或异常状态，点击任意断面聚焦查看详情。
            </p>
            <div className="v2-twin-station-list">
              {stations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={view === item.id ? 'v2-is-active' : ''}
                  onClick={() => onViewChange(item.id)}
                  aria-pressed={view === item.id}
                >
                  <span className={`v2-twin-station-list__dot v2-twin-station-list__dot--${item.tone}`} />
                  <span className="v2-twin-station-list__id v2-mono">{item.id}</span>
                  <span className="v2-twin-station-list__name">
                    {item.name.replace(' 断面', '')}
                  </span>
                  <span className="v2-twin-station-list__class">{item.waterClass} 类</span>
                  <span className="v2-twin-station-list__status">{item.statusLabel}</span>
                </button>
              ))}
            </div>
            <div className="v2-twin-info__meta">
              <span className="v2-mono">更新 {updatedAt}</span>
              <span>{stations.length} 个监测断面</span>
            </div>
            <Link to="/analysis" className="v2-twin-panel-link">
              进入水环境分析
              <Icon name="arrow-right" size={12} />
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
