import { useLayoutEffect, useRef, useState } from 'react';
import type { Station, StationId } from '../../types';
import { Panel } from '../../components/ui/Panel';
import { Icon } from '../../components/ui/Icon';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { Link } from 'react-router-dom';

const RIVER_PATH =
  'M -30 132 C 100 132, 150 48, 300 52 C 430 56, 470 208, 620 204 C 770 200, 810 56, 950 52 C 1010 50, 1020 54, 1050 56';

const FRACTIONS = [0.17, 0.5, 0.83];

interface RiverStageProps {
  stations: Station[];
  selected: StationId;
  onSelect: (id: StationId) => void;
  turbidity: Record<StationId, number | null>;
  level: number | null;
  syncedAt: string;
}

const toneLabel: Record<Station['tone'], string> = {
  good: '正常',
  watch: '关注',
  alert: '异常',
};

const riskCode: Record<Station['tone'], string> = {
  good: 'R0',
  watch: 'R1',
  alert: 'R3',
};

const scaleTicks = [
  { left: 0, label: '0' },
  { left: 34, label: '8.5' },
  { left: 68, label: '17.2' },
  { left: 100, label: '24.6 km' },
];

const focusStation = (stations: Station[]) =>
  stations.find((station) => station.tone === 'alert') ??
  stations.find((station) => station.tone === 'watch');

export function RiverStage({
  stations,
  selected,
  onSelect,
  turbidity,
  level,
  syncedAt,
}: RiverStageProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [anchors, setAnchors] = useState<{ x: number; y: number }[]>([]);
  const priority = focusStation(stations);
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    setAnchors(
      FRACTIONS.map((f) => {
        const point = path.getPointAtLength(total * f);
        return { x: point.x, y: point.y };
      }),
    );
  }, []);

  return (
    <Panel
      code="01"
      title="河流整体态势"
      en="RIVER STATUS"
      className="v2-river-panel"
      bodyClassName="v2-river-panel__body"
      actions={
        <>
          <div className="v2-legend" aria-label="断面状态图例">
            <span><i className="v2-legend__dot v2-legend__dot--good" />正常</span>
            <span><i className="v2-legend__dot v2-legend__dot--watch" />关注</span>
            <span><i className="v2-legend__dot v2-legend__dot--alert" />异常</span>
          </div>
          <Link to="/monitor" className="v2-panel-link">
            数字孪生
            <Icon name="arrow-up-right" size={12} />
          </Link>
        </>
      }
    >
      <div className="v2-river-stage">
        <svg
          className="v2-river-stage__svg"
          viewBox="0 0 1000 260"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="river-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2a6a84" />
              <stop offset="0.22" stopColor="#2f9b9c" />
              <stop offset="0.5" stopColor="#4fe6d2" />
              <stop offset="0.74" stopColor="#379fb2" />
              <stop offset="1" stopColor="#3f77a0" />
            </linearGradient>
            <linearGradient id="river-sheen" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(220,255,250,0)" />
              <stop offset="0.5" stopColor="rgba(220,255,250,0.55)" />
              <stop offset="1" stopColor="rgba(220,255,250,0)" />
            </linearGradient>
            <filter id="river-glow" x="-20%" y="-80%" width="140%" height="260%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          <path
            d={RIVER_PATH}
            fill="none"
            stroke="rgba(79,230,210,0.13)"
            strokeWidth="52"
            filter="url(#river-glow)"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={RIVER_PATH}
            fill="none"
            stroke="url(#river-grad)"
            strokeWidth="22"
            strokeOpacity="0.58"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={RIVER_PATH}
            fill="none"
            stroke="url(#river-sheen)"
            strokeWidth="5"
            strokeOpacity="0.25"
            vectorEffect="non-scaling-stroke"
          />

          <g className="v2-river-stage__banks" aria-hidden="true">
            <path
              className="v2-river-stage__bank"
              d={RIVER_PATH}
              transform="translate(0,-14)"
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="v2-river-stage__bank"
              d={RIVER_PATH}
              transform="translate(0,14)"
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="v2-river-stage__bank v2-river-stage__bank--outer"
              d={RIVER_PATH}
              transform="translate(0,-22)"
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="v2-river-stage__bank v2-river-stage__bank--outer"
              d={RIVER_PATH}
              transform="translate(0,22)"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          <path
            className="v2-river-stage__ripple"
            d={RIVER_PATH}
            transform="translate(0,-5)"
            fill="none"
            strokeDasharray="2 20"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
          <path
            className="v2-river-stage__ripple v2-river-stage__ripple--alt"
            d={RIVER_PATH}
            transform="translate(0,6)"
            fill="none"
            strokeDasharray="2 26"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />

          <path
            className="v2-river-stage__flow"
            d={RIVER_PATH}
            fill="none"
            stroke="rgba(225,255,250,0.55)"
            strokeWidth="1"
            strokeDasharray="1 12"
            vectorEffect="non-scaling-stroke"
          />
          {!reducedMotion && (
            <path
              className="v2-river-stage__comet"
              d={RIVER_PATH}
              fill="none"
              stroke="rgba(196,255,248,0.7)"
              strokeWidth="2"
              strokeDasharray="58 820"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path ref={pathRef} d={RIVER_PATH} fill="none" stroke="none" />

          {!reducedMotion &&
            [0, 1, 2].map((i) => (
              <circle key={i} r="1.7" fill="#dffff9" opacity="0.85">
                <animateMotion
                  dur={`${15 + i * 3}s`}
                  begin={`${-i * 5}s`}
                  repeatCount="indefinite"
                  path={RIVER_PATH}
                />
              </circle>
            ))}
        </svg>

        <div className="v2-river-telemetry" aria-hidden="true">
          <span className="v2-river-telemetry__item">
            <em>FLOW</em>
            <b className="v2-mono">—</b>
            <small>暂无流速</small>
          </span>
          <span className="v2-river-telemetry__sep" />
          <span className="v2-river-telemetry__item">
            <em>LEVEL</em>
            <b className="v2-mono">{level !== null ? level.toFixed(2) : '—'}</b>
            <small>m</small>
          </span>
          <span className="v2-river-telemetry__sep" />
          <span
            className={`v2-river-telemetry__item ${
              priority?.tone === 'alert' ? 'v2-is-alert' : ''
            }`.trim()}
          >
            <em>RISK</em>
            <b className="v2-mono">{priority ? riskCode[priority.tone] : 'R0'}</b>
            <small>{priority?.name.replace(' 断面', '') ?? '—'}</small>
          </span>
        </div>

        <div className="v2-river-stage__stations">
          {stations.map((station, i) => {
            const anchor = anchors[i];
            if (!anchor) return null;
            const side = anchor.y > 140 ? 'bottom' : 'top';
            return (
              <button
                key={station.id}
                type="button"
                className={`v2-station v2-station--${station.tone} ${
                  selected === station.id ? 'v2-is-selected' : ''
                }`.trim()}
                style={{
                  left: `${(anchor.x / 1000) * 100}%`,
                  top: `${(anchor.y / 260) * 100}%`,
                }}
                aria-label={`${station.name}，${station.statusLabel}，水质 ${station.waterClass} 类`}
                aria-pressed={selected === station.id}
                onClick={() => onSelect(station.id)}
              >
                <span className="v2-station__node">
                  {station.tone === 'alert' && <span className="v2-station__pulse" />}
                  {station.tone === 'alert' && <span className="v2-station__focus" aria-hidden="true" />}
                  <span className="v2-station__ring" />
                  <span className="v2-station__core" />
                </span>
                <span className={`v2-station__label v2-station__label--${side}`}>
                  <span className="v2-station__label-head">
                    <span className="v2-station__name">{station.name.replace(' 断面', '')}</span>
                    <span className="v2-station__class">{station.waterClass} 类水</span>
                    {station.tone !== 'good' && (
                      <span className={`v2-station__risk v2-station__risk--${station.tone}`}>
                        {riskCode[station.tone]}
                      </span>
                    )}
                  </span>
                  <span className="v2-station__meta">
                    {toneLabel[station.tone]} · 浊度{' '}
                    {turbidity[station.id] !== null ? `${turbidity[station.id]} NTU` : '暂无'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="v2-river-foot">
          <span className="v2-river-foot__note">示意视图 · 非地理比例</span>
          <div className="v2-river-scale" aria-hidden="true">
            <span className="v2-river-scale__line" />
            {scaleTicks.map((tick) => (
              <span
                key={tick.label}
                className="v2-river-scale__tick"
                style={{
                  left: `${tick.left}%`,
                  transform:
                    tick.left === 0
                      ? 'translateX(0)'
                      : tick.left === 100
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                }}
              >
                <i />
                <em className="v2-mono">{tick.label}</em>
              </span>
            ))}
          </div>
          <span className="v2-river-foot__sync v2-mono">SYNC {syncedAt}</span>
        </div>
      </div>
    </Panel>
  );
}
