import { useEffect, useRef, type CSSProperties } from 'react';
import type { StationId } from '../../types';
import type { TwinStation } from './twinTypes';
import { STATION_MAP } from '../overview/overviewAdapter';
import {
  NODE_VISUAL_COLORS,
  NODE_VISUAL_LABELS,
  type NodeVisualState,
  type NodeVisualStatus,
} from '@/features/threeD/nodeVisual';
import { nodeLabelFrames } from '@/features/threeD/nodeLabelProjection';

interface NodeLabelOverlayProps {
  stations: TwinStation[];
  nodeStates: Record<string, NodeVisualState>;
  onSelect: (id: StationId) => void;
}

const PRIORITY: Record<NodeVisualStatus, number> = {
  abnormal: 4,
  recovery: 3,
  watch: 2,
  offline: 1,
  normal: 0,
};

function keyMetric(station: TwinStation): string {
  const metric = station.metrics.find((item) => item.tone === 'alert')
    ?? station.metrics.find((item) => item.value !== null);
  if (!metric || metric.value === null) return '关键指标 —';
  return `${metric.label} ${metric.value.toFixed(metric.precision)}${metric.unit}`;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** 屏幕空间长方形标签：投影器写帧，本组件只更新 DOM，不参与 3D 深度。 */
export function NodeLabelOverlay({ stations, nodeStates, onSelect }: NodeLabelOverlayProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let raf = 0;
    let last = 0;

    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      if (time - last < 32) return;
      last = time;

      const entries = stations.map((station) => {
        const reachId = STATION_MAP[station.id];
        const frame = nodeLabelFrames[reachId];
        const element = refs.current[station.id];
        const tier = nodeStates[reachId]?.tier ?? 'normal';
        return { station, frame, element, priority: PRIORITY[tier] };
      }).filter((entry) => entry.frame && entry.element)
        .sort((a, b) => (b.priority - a.priority) || (a.frame!.y - b.frame!.y));

      const placed: Rect[] = [];
      for (const { frame, element } of entries) {
        const el = element!;
        if (!frame!.visible) {
          el.dataset.visible = 'false';
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
          continue;
        }

        el.dataset.lod = frame!.lod;
        el.dataset.visible = 'true';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';

        const scale = frame!.scale;
        const width = el.offsetWidth * scale;
        const height = el.offsetHeight * scale;
        const parent = el.parentElement;
        const stageWidth = parent?.clientWidth ?? 0;
        const stageHeight = parent?.clientHeight ?? 0;
        let left = frame!.x - width / 2;
        let top = frame!.y - height;
        left = Math.max(6, Math.min(stageWidth - width - 6, left));
        top = Math.max(6, Math.min(stageHeight - height - 6, top));

        let rect: Rect = { left, right: left + width, top, bottom: top + height };
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const hit = placed.find((item) => overlaps(rect, item));
          if (!hit) break;
          const shift = rect.bottom - hit.top + 8;
          top = Math.max(6, top - shift);
          rect = { left, right: left + width, top, bottom: top + height };
        }
        placed.push(rect);

        const stem = Math.max(0, frame!.y - rect.bottom);
        el.style.left = `${frame!.x}px`;
        el.style.top = `${rect.bottom}px`;
        el.style.transform = `translate(-50%, -100%) scale(${scale})`;
        el.style.setProperty('--stem', `${stem / scale}px`);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stations, nodeStates]);

  return (
    <div className="v2-node-label-layer" aria-label="监测节点标签">
      {stations.map((station) => {
        const reachId = STATION_MAP[station.id];
        const tier = nodeStates[reachId]?.tier ?? 'normal';
        const color = NODE_VISUAL_COLORS[tier];
        return (
          <button
            key={station.id}
            ref={(element) => { refs.current[station.id] = element; }}
            type="button"
            className={`v2-node-label is-${tier}`}
            data-station-id={station.id}
            data-lod="far"
            data-visible="false"
            style={{ '--node-color': color } as CSSProperties}
            onClick={() => onSelect(station.id)}
            aria-label={`${station.name}，${NODE_VISUAL_LABELS[tier]}`}
          >
            <span className="v2-node-label__letter">{station.id}</span>
            <span className="v2-node-label__body">
              <span className="v2-node-label__head">
                <b>{station.name.replace(' 断面', '')}</b>
                <em>{NODE_VISUAL_LABELS[tier]}</em>
              </span>
              <span className="v2-node-label__risk v2-mono">
                {station.riskCode} · {station.statusLabel}
              </span>
              <span className="v2-node-label__metric v2-mono">{keyMetric(station)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
