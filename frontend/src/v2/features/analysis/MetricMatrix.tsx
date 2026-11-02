import type { AnalysisMetric, AnalysisMetricKey } from './analysisTypes';
import type { Station, StationId } from '../../types';
import { Panel } from '../../components/ui/Panel';

interface MetricMatrixProps {
  metrics: AnalysisMetric[];
  stations: Station[];
  selectedMetric: AnalysisMetricKey;
  selectedStation: StationId;
  onSelect: (metric: AnalysisMetricKey, station: StationId) => void;
}

export function MetricMatrix({
  metrics,
  stations,
  selectedMetric,
  selectedStation,
  onSelect,
}: MetricMatrixProps) {
  return (
    <Panel
      code="04"
      title="指标矩阵"
      en="METRIC MATRIX"
      className="v2-matrix-panel"
      footer={
        <span className="v2-matrix-panel__foot">
          点击单元格同时切换指标与断面
          <span className="v2-mono">A / B / C</span>
        </span>
      }
    >
      <div className="v2-matrix">
        <div className="v2-matrix__head">
          <span />
          {stations.map((station) => (
            <button
              key={station.id}
              type="button"
              className={selectedStation === station.id ? 'v2-is-active' : ''}
              onClick={() => onSelect(selectedMetric, station.id)}
            >
              {station.id}
            </button>
          ))}
        </div>
        {metrics.map((metric, index) => {
          const groupStart =
            index > 0 && metric.group !== metrics[index - 1].group;
          return (
            <div
              className={`v2-matrix__row ${groupStart ? 'is-group-start' : ''}`.trim()}
              key={metric.key}
            >
              <button
                type="button"
                className={`v2-matrix__label ${
                  selectedMetric === metric.key ? 'is-active' : ''
                }`.trim()}
                onClick={() => onSelect(metric.key, selectedStation)}
                title={metric.label}
              >
                {metric.label}
              </button>
              {stations.map((station) => {
                const status = metric.status[station.id];
                const active =
                  selectedMetric === metric.key && selectedStation === station.id;
                return (
                  <button
                    key={station.id}
                    type="button"
                    className={`v2-matrix__cell v2-matrix__cell--${status} ${
                      active ? 'is-active' : ''
                    }`.trim()}
                    onClick={() => onSelect(metric.key, station.id)}
                    title={`${metric.label} · ${station.name} ${metric.values[station.id] !== null ? (metric.values[station.id] as number).toFixed(metric.precision) : '—'} ${metric.unit}`}
                  >
                    <span className={`v2-mi-dot v2-mi-dot--${status}`} />
                    {metric.values[station.id] !== null ? (metric.values[station.id] as number).toFixed(metric.precision) : '—'}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
