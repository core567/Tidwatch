import { Link } from 'react-router-dom';
import type { TwinMetric, TwinStation } from './twinTypes';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { Sparkline } from '../../components/ui/Sparkline';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { TwinRiskInfo, TwinView } from './types';

const badgeTone: Record<TwinRiskInfo['tone'], BadgeTone> = {
  good: 'good',
  watch: 'mid',
  alert: 'high',
};

const toneLabel: Record<TwinRiskInfo['tone'], string> = {
  good: '正常',
  watch: '关注',
  alert: '异常',
};

interface TwinMetricHudProps {
  view: TwinView;
  station?: TwinStation;
  metrics: TwinMetric[];
  risk: TwinRiskInfo;
  open: boolean;
  onToggle: () => void;
  /** 场景状态标注：LIVE 3D / 场景演示 · 3D / 2D 示意模式 */
  sceneLabel?: string;
}

export function TwinMetricHud({
  view,
  station,
  metrics,
  risk,
  open,
  onToggle,
  sceneLabel = 'LIVE 3D',
}: TwinMetricHudProps) {
  const reducedMotion = usePrefersReducedMotion();

  if (!open) {
    return (
      <button
        type="button"
        className="v2-twin-hud-tab v2-twin-hud-tab--right"
        onClick={onToggle}
        aria-expanded={false}
        aria-controls="twin-metric-hud"
      >
        <Icon name="analysis" size={14} />
        <span>实时指标</span>
      </button>
    );
  }

  return (
    <aside className="v2-twin-hud v2-twin-hud--right" id="twin-metric-hud" aria-label="实时指标与风险">
      <header className="v2-twin-hud__head">
        <span className="v2-mono">LIVE METRICS</span>
        <span className="v2-twin-metric-hud__scope">
          {view === 'overview' ? '全域均值' : station?.name.replace(' 断面', '')}
        </span>
        <button
          type="button"
          className="v2-twin-hud__collapse"
          onClick={onToggle}
          aria-label="收起实时指标"
          aria-expanded
          aria-controls="twin-metric-hud"
        >
          <Icon name="close" size={13} />
        </button>
      </header>

      <div className="v2-twin-hud__body">
        <div className="v2-twin-metric-list">
          {metrics.map((metric) => (
            <div className={`v2-twin-metric v2-twin-metric--${metric.tone}`} key={metric.key}>
              <span className="v2-twin-metric__label">
                {metric.label}
                <em>{metric.en}</em>
              </span>
              <span className="v2-twin-metric__value v2-mono">
                {metric.value !== null ? metric.value.toFixed(metric.precision) : '—'}
                {metric.unit && <small>{metric.unit}</small>}
              </span>
              <Sparkline
                values={metric.spark}
                width={64}
                height={20}
                tone={metric.tone}
                fill={false}
                showEnd={false}
                animate={!reducedMotion}
              />
              <span className={`v2-twin-metric__dot v2-twin-metric__dot--${metric.tone}`} />
            </div>
          ))}
        </div>

        <div className={`v2-twin-risk v2-twin-risk--${risk.tone}`}>
          <div className="v2-twin-risk__top">
            <Badge tone={badgeTone[risk.tone]}>
              {risk.code} · {toneLabel[risk.tone]}
            </Badge>
            <span className="v2-twin-risk__context">
              {view === 'overview' ? '活跃事件' : '断面风险'}
            </span>
            <span className="v2-twin-risk__status">{risk.status}</span>
          </div>
          <b>{risk.title}</b>
          <p>{risk.desc}</p>
          <Link to={risk.link} className="v2-twin-panel-link v2-twin-risk__link">
            {risk.linkLabel}
            <Icon name="arrow-right" size={12} />
          </Link>
        </div>

        <span className="v2-twin-hud__note v2-mono">{sceneLabel}</span>
      </div>
    </aside>
  );
}
