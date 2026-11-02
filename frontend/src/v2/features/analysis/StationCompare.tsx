import type { AnalysisMetric } from './analysisTypes';
import type { Station, StationId } from '../../types';
import { STATION_COLORS } from '../../charts/colors';
import { Panel } from '../../components/ui/Panel';

export function StationCompare({
  metric,
  stations,
  selectedStation,
  onSelectStation,
}: {
  metric: AnalysisMetric;
  stations: Station[];
  selectedStation: StationId;
  onSelectStation: (id: StationId) => void;
}) {
  const values = stations.map((station) => metric.values[station.id]).filter((v): v is number => v !== null);
  const limitValues = metric.limits.map((item) => item.value);
  const maxValue = Math.max(...values, ...limitValues, 0);
  const scaleMax = maxValue * 1.12;
  const diff = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  const maxStation = values.length
    ? stations.reduce((acc, station) =>
        (metric.values[station.id] ?? -Infinity) > (metric.values[acc.id] ?? -Infinity) ? station : acc,
      )
    : stations[0];
  const limitMarks = metric.limits.map((item) => ({
    value: item.value,
    label: item.label,
    left: (item.value / scaleMax) * 100,
  }));

  return (
    <Panel
      code="03"
      title="断面同期对比"
      en="STATION COMPARE"
      className="v2-compare-panel"
      footer={
        <>
          <span className="v2-compare-panel__foot">
            最高值 · {maxStation.name.replace(' 断面', '')}
            <b className="v2-mono">
              {metric.values[maxStation.id] !== null ? (metric.values[maxStation.id] as number).toFixed(metric.precision) : '—'}{' '}
              {metric.unit}
            </b>
          </span>
          <span className="v2-compare-panel__foot v2-compare-panel__foot--right v2-mono">
            差值 {values.length > 1 ? `${diff.toFixed(metric.precision)} ${metric.unit}` : '暂无对比'}
          </span>
        </>
      }
    >
      <div className="v2-compare-summary">
        <span>
          当前指标 <b>{metric.label}</b>
        </span>
        <span className="v2-mono">
          {metric.unit ? `单位 ${metric.unit}` : '无量纲'}
          {metric.limits.length > 0 &&
            ` · ${metric.limits.map((l) => l.label).join(' / ')}`}
        </span>
      </div>

      <div className="v2-compare-rows">
        {stations.map((station) => {
          const value = metric.values[station.id];
          const status = metric.status[station.id];
          const delta = metric.deltas[station.id];
          const hasDelta = delta !== null && Number.isFinite(delta);
          const arrow = !hasDelta ? '—' : (delta as number) > 0 ? '▲' : (delta as number) < 0 ? '▼' : '—';
          const width = value !== null ? Math.min(100, (value / scaleMax) * 100) : 0;
          return (
            <button
              key={station.id}
              type="button"
              className={`v2-compare-row ${
                selectedStation === station.id ? 'v2-is-active' : ''
              }`.trim()}
              onClick={() => onSelectStation(station.id)}
              aria-pressed={selectedStation === station.id}
            >
              <span className="v2-compare-row__station">
                <i style={{ background: STATION_COLORS[station.id] }} />
                {station.id} · {station.name.replace(' 断面', '').replace(`${station.id} `, '')}
              </span>
              <span className={`v2-compare-row__value v2-compare-row__value--${status}`}>
                <b className="v2-mono">{value !== null ? value.toFixed(metric.precision) : '—'}</b>
                <small>{metric.unit}</small>
              </span>
              <span className="v2-compare-row__track">
                <i
                  className="v2-compare-row__fill"
                  data-status={status}
                  style={{ width: `${width}%` }}
                />
                {limitMarks.map((mark) => (
                  <i
                    key={`${mark.value}-${mark.label}`}
                    className="v2-compare-row__limit"
                    style={{ left: `${mark.left}%` }}
                    title={`${mark.label} ${metric.unit}`}
                  />
                ))}
              </span>
              <span
                className={`v2-compare-row__delta v2-mono ${
                  status === 'alert' ? 'v2-is-alert' : status === 'watch' ? 'v2-is-watch' : ''
                }`.trim()}
              >
                {hasDelta ? `${arrow} ${Math.abs(delta as number).toFixed(1)}%` : '环比 —'}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
