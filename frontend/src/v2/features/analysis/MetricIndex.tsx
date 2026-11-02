import type { AnalysisMetric, AnalysisMetricKey } from './analysisTypes';
import type { Station, StationId } from '../../types';
import { Panel } from '../../components/ui/Panel';

interface MetricIndexProps {
  metrics: AnalysisMetric[];
  stations: Station[];
  selectedMetric: AnalysisMetricKey;
  selectedStation: StationId;
  onSelectMetric: (key: AnalysisMetricKey) => void;
}

interface MetricGroup {
  group: string;
  groupEn: string;
  items: AnalysisMetric[];
}

function groupMetrics(metrics: AnalysisMetric[]): MetricGroup[] {
  return metrics.reduce<MetricGroup[]>((groups, metric) => {
    const last = groups[groups.length - 1];
    if (last && last.group === metric.group) {
      last.items.push(metric);
    } else {
      groups.push({ group: metric.group, groupEn: metric.groupEn, items: [metric] });
    }
    return groups;
  }, []);
}

export function MetricIndex({
  metrics,
  stations,
  selectedMetric,
  selectedStation,
  onSelectMetric,
}: MetricIndexProps) {
  const groups = groupMetrics(metrics);
  const station = stations.find((s) => s.id === selectedStation);
  const alertCount = metrics.filter(
    (m) => m.status[selectedStation] !== 'good',
  ).length;

  return (
    <Panel
      code="01"
      title="指标目录"
      en="METRIC INDEX"
      className="v2-metric-index-panel"
      bodyClassName="metric-index-panel__body"
      footer={
        <span className="v2-metric-index__foot">
          <span className="v2-status-dot v2-status-dot--warn" style={{ width: 5, height: 5 }} />
          {station?.name.replace(' 断面', '')} · {alertCount} 项需关注
        </span>
      }
    >
      <div className="v2-metric-index">
        {groups.map((group) => (
          <div className="v2-metric-index__group" key={group.group}>
            <div className="v2-metric-index__group-head">
              {group.group}
              <span>{group.groupEn}</span>
            </div>
            {group.items.map((metric) => {
              const value = metric.values[selectedStation];
              const delta = metric.deltas[selectedStation];
              const status = metric.status[selectedStation];
              const hasDelta = delta !== null && Number.isFinite(delta);
              const arrow = !hasDelta ? '—' : (delta as number) > 0 ? '▲' : (delta as number) < 0 ? '▼' : '—';
              return (
                <button
                  key={metric.key}
                  type="button"
                  className={`v2-metric-index__item ${
                    selectedMetric === metric.key ? 'v2-is-active' : ''
                  }`.trim()}
                  onClick={() => onSelectMetric(metric.key)}
                  aria-pressed={selectedMetric === metric.key}
                >
                  <span className={`v2-mi-dot v2-mi-dot--${status}`} />
                  <span className="v2-mi-label">{metric.label}</span>
                  <span className="v2-mi-value v2-mono">
                    {value !== null ? value.toFixed(metric.precision) : '—'}
                    {metric.unit && value !== null && <em>{metric.unit}</em>}
                  </span>
                  <span
                    className={`v2-mi-delta v2-mono ${
                      status === 'alert' ? 'v2-is-alert' : status === 'watch' ? 'v2-is-watch' : ''
                    }`.trim()}
                  >
                    {hasDelta ? `${arrow} ${Math.abs(delta as number).toFixed(1)}%` : '环比 —'}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}
