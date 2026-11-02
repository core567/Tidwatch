import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { StationId } from '../../types';
import type { TwinStation } from './twinTypes';
import { Icon } from '../../components/ui/Icon';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { TwinView } from './types';

const RIVER_PATH =
  'M -50 300 C 140 300, 150 230, 260 236 C 380 242, 410 380, 520 386 C 640 392, 690 238, 800 224 C 890 212, 950 240, 1050 230';

interface TwinSceneProps {
  stations: TwinStation[];
  view: TwinView;
  flowOn: boolean;
  labelsOn: boolean;
  terrainOn: boolean;
  mountRef: RefObject<HTMLDivElement>;
  onSelectStation: (id: StationId) => void;
  /** '3d'：仅渲染 3D 挂载槽（正常运行时主场景）；'fallback'：2D 示意层 + 空挂载槽 */
  mode: '3d' | 'fallback';
  /** 挂载进 3D 槽的 React 子树（原项目 RiverScene 组件树，不建独立 root） */
  children?: ReactNode;
}

export function TwinScene({
  stations,
  view,
  flowOn,
  labelsOn,
  terrainOn,
  mountRef,
  onSelectStation,
  mode,
  children,
}: TwinSceneProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [anchors, setAnchors] = useState<{ x: number; y: number }[]>([]);
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    const xs = stations.map((station) => station.position.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const step = Math.max(2, total / 1600);

    const next = stations.map((station) => {
      // 2D fallback 使用中央安全走廊，避免被左右 HUD 覆盖。
      // 这不是 3D 世界坐标，真实位置由未来 3D 场景适配层提供。
      const ratio =
        maxX === minX ? 0.5 : 0.37 + ((station.position.x - minX) / (maxX - minX)) * 0.26;
      const targetX = ratio * 1000;
      let best = Number.POSITIVE_INFINITY;
      let point = { x: 0, y: 0 };
      for (let distance = 0; distance <= total; distance += step) {
        const candidate = path.getPointAtLength(distance);
        const diff = Math.abs(candidate.x - targetX);
        if (diff < best) {
          best = diff;
          point = { x: candidate.x, y: candidate.y };
        }
      }
      return point;
    });
    setAnchors(next);
  }, [stations]);

  const active = view !== 'overview';

  if (mode === '3d') {
    return (
      <div
        className="v2-twin-scene v2-twin-scene--3d"
        data-scene-mode="3d"
        role="group"
        aria-label="河流三维数字孪生场景"
      >
        <div
          ref={mountRef}
          className="v2-twin-scene__mount"
          data-scene-mount="twin-3d"
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="v2-twin-scene"
      data-scene-mode="fallback"
      role="group"
      aria-label="河流二维示意图层"
    >
      <div className="v2-twin-scene__fallback" data-scene-fallback>
        <svg
          className="v2-twin-scene__svg"
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="twin-river-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2a6a84" />
              <stop offset="0.35" stopColor="#3fbfb4" />
              <stop offset="0.65" stopColor="#4fe6d2" />
              <stop offset="1" stopColor="#3f77a0" />
            </linearGradient>
            <linearGradient id="twin-river-sheen" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(220,255,250,0)" />
              <stop offset="0.5" stopColor="rgba(220,255,250,0.45)" />
              <stop offset="1" stopColor="rgba(220,255,250,0)" />
            </linearGradient>
            <radialGradient id="twin-depth" cx="50%" cy="52%" r="65%">
              <stop offset="0" stopColor="rgba(79,230,210,0.10)" />
              <stop offset="0.6" stopColor="rgba(16,59,71,0.04)" />
              <stop offset="1" stopColor="rgba(2,9,13,0)" />
            </radialGradient>
            <filter id="twin-glow" x="-20%" y="-80%" width="140%" height="260%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>

          <rect width="1000" height="600" fill="url(#twin-depth)" />

          <g
            className={`v2-twin-scene__terrain ${terrainOn ? '' : 'is-hidden'}`.trim()}
            aria-hidden="true"
          >
            <g className="v2-twin-scene__contours">
              <path d="M -40 100 C 220 0, 420 220, 700 120 S 1120 0, 1060 110" />
              <path d="M -40 150 C 220 50, 420 270, 700 170 S 1120 50, 1060 160" />
              <path d="M -40 430 C 220 330, 420 520, 700 420 S 1120 300, 1060 410" />
              <path d="M -40 480 C 220 380, 420 570, 700 470 S 1120 350, 1060 460" />
              <path d="M -40 530 C 220 430, 420 620, 700 520 S 1120 400, 1060 510" />
            </g>
            <g className="v2-twin-scene__rings">
              {anchors.map((anchor, index) => {
                const station = stations[index];
                return (
                  <g key={station?.id ?? index}>
                    <circle cx={anchor.x} cy={anchor.y} r="42" />
                    <circle
                      cx={anchor.x}
                      cy={anchor.y}
                      r="74"
                      className={station?.tone === 'alert' ? 'v2-is-alert' : undefined}
                    />
                  </g>
                );
              })}
            </g>
            <g className="v2-twin-scene__banks">
              <path d={RIVER_PATH} transform="translate(0,-16)" />
              <path d={RIVER_PATH} transform="translate(0,16)" />
              <path d={RIVER_PATH} transform="translate(0,-25)" className="v2-is-outer" />
              <path d={RIVER_PATH} transform="translate(0,25)" className="v2-is-outer" />
            </g>
          </g>

          <path
            d={RIVER_PATH}
            fill="none"
            stroke="rgba(79,230,210,0.16)"
            strokeWidth="60"
            filter="url(#twin-glow)"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={RIVER_PATH}
            fill="none"
            stroke="url(#twin-river-grad)"
            strokeWidth="27"
            strokeOpacity="0.64"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={RIVER_PATH}
            fill="none"
            stroke="url(#twin-river-sheen)"
            strokeWidth="7"
            strokeOpacity="0.3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="v2-twin-scene__ripple"
            d={RIVER_PATH}
            transform="translate(0,-5)"
            fill="none"
            strokeDasharray="2 22"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
          <path
            className="v2-twin-scene__ripple v2-twin-scene__ripple--alt"
            d={RIVER_PATH}
            transform="translate(0,7)"
            fill="none"
            strokeDasharray="2 28"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
          <path
            className={`v2-twin-scene__flow ${flowOn ? '' : 'is-paused'}`.trim()}
            d={RIVER_PATH}
            fill="none"
            stroke="rgba(225,255,250,0.72)"
            strokeWidth="1.4"
            strokeDasharray="2 12"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className={`v2-twin-scene__flow v2-twin-scene__flow--wide ${
              flowOn ? '' : 'is-paused'
            }`.trim()}
            d={RIVER_PATH}
            fill="none"
            stroke="rgba(207,255,249,0.22)"
            strokeWidth="2.2"
            strokeDasharray="30 118"
            vectorEffect="non-scaling-stroke"
          />
          <path ref={pathRef} d={RIVER_PATH} fill="none" stroke="none" />
        </svg>
      </div>

      <div
        ref={mountRef}
        className="v2-twin-scene__mount"
        data-scene-mount="twin-3d"
        aria-hidden="true"
      />

      {!reducedMotion && <div className="v2-twin-scene__scan" aria-hidden="true" />}

      <div className="v2-twin-scene__mount-frame" aria-hidden="true">
        <span className="v2-twin-scene__mount-label v2-mono">3D MOUNT SLOT · 2D FALLBACK</span>
      </div>

      <div className="v2-twin-stations">
        {stations.map((station, index) => {
          const anchor = anchors[index];
          if (!anchor) return null;
          const selected = view === station.id;
          // 交错放置标签，避免相邻断面在中窄屏下互相挤压。
          const side = index % 2 === 0 ? 'top' : 'bottom';
          // 靠近左右 HUD 的节点把标签向内侧偏移，避免被面板覆盖。
          const horizontal =
            anchor.x < 450 ? 'right' : anchor.x > 550 ? 'left' : 'center';
          const labelsVisible = labelsOn || selected;
          return (
            <button
              key={station.id}
              type="button"
              className={`v2-twin-node v2-twin-node--${station.tone} ${
                selected ? 'is-selected' : ''
              } ${active && !selected ? 'is-muted' : ''}`.trim()}
              style={{
                left: `${(anchor.x / 1000) * 100}%`,
                top: `${(anchor.y / 600) * 100}%`,
              }}
              onClick={() => onSelectStation(station.id)}
              aria-label={`${station.name}，${station.statusLabel}，水质 ${station.waterClass} 类`}
              aria-pressed={selected}
              data-station-id={station.id}
            >
              <span className="v2-twin-node__pylon" aria-hidden="true" />
              <span className="v2-twin-node__anchor">
                {station.tone === 'alert' && <span className="v2-twin-node__pulse" />}
                <span className="v2-twin-node__ring" />
                <span className="v2-twin-node__core" />
              </span>
              {labelsVisible && (
                <span
                  className={`v2-twin-node__label v2-twin-node__label--${side} v2-twin-node__label--${horizontal}`}
                >
                  <span className="v2-twin-node__head">
                    <b>{station.name.replace(' 断面', '')}</b>
                    <span className="v2-twin-node__class">{station.waterClass} 类</span>
                    {station.tone !== 'good' && (
                      <span className={`v2-twin-node__risk v2-twin-node__risk--${station.tone}`}>
                        {station.riskCode}
                      </span>
                    )}
                  </span>
                  <span className="v2-twin-node__meta">
                    {station.statusLabel} · 更新 {station.updatedAt}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="v2-twin-scene__direction" aria-hidden="true">
        <Icon name="wave" size={12} />
        <span className="v2-mono">FLOW →</span>
        <span>示意流向</span>
      </div>
    </div>
  );
}
