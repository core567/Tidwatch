import type { CSSProperties } from 'react';
import type { AnalysisMetric, AnalysisRange } from './analysisTypes';
import type { Station, StationId } from '../../types';
import { STATION_COLORS } from '../../charts/colors';
import { AnalysisTrendChart } from '../../charts/AnalysisTrendChart';
import { Panel } from '../../components/ui/Panel';
import { Segmented } from '../../components/ui/Segmented';

interface AnalysisTrendPanelProps {
  metric: AnalysisMetric;
  stations: Station[];
  selectedStation: StationId;
  range: AnalysisRange;
  labels: string[];
  eventWindow?: [number, number];
  leadReachName?: string;
  /** 状态角标（按观测来源显示：模拟观测 / 官方观测 / 观测记录） */
  demoLabel?: string;
  /** 观测来源说明，用于趋势备注 */
  sourceDesc?: string;
  /** 场景演示模式（内存回放），与“模拟观测来源”区分 */
  demoMode?: boolean;
  /** 演示剧本仅 24h：7d 档禁用并提示 */
  demoOnly24h?: boolean;
  onRangeChange: (range: AnalysisRange) => void;
  onSelectStation: (id: StationId) => void;
}

/**
 * 三态趋势面板（F4 数据方案 A）：
 * - series 且有真实序列：连续曲线 + 阈值线（仅浊度 60 NTU）+ 峰值/异常区间（真实驱动）
 * - snapshot（官方日频仅最新快照）：保留最新值 + 「官方快照」角标 + 历史不足空态
 * - 完全无数据：规范空态
 */
export function AnalysisTrendPanel({
  metric,
  stations,
  selectedStation,
  range,
  labels,
  eventWindow,
  leadReachName,
  demoLabel = 'OBSERVATIONS',
  sourceDesc = '观测序列',
  demoMode = false,
  demoOnly24h = false,
  onRangeChange,
  onSelectStation,
}: AnalysisTrendPanelProps) {
  const series = stations.map((station) => ({
    id: station.id,
    name: station.name.replace(' 断面', ''),
    data: metric.series[range][station.id],
  }));
  const hasSeries = metric.historyKind === 'series' && labels.length > 0;

  const note =
    metric.historyKind === 'snapshot'
      ? '历史数据不足：官方自动站为日频发布，当前仅保存最新快照，不绘制连续曲线。'
      : metric.historyKind === 'none'
        ? '暂无历史观测记录。'
        : demoMode
          ? `场景演示序列（内存回放，不落库；近 ${labels.length} 个演示点）`
          : metric.key === 'turbidity'
            ? leadReachName
            ? `${leadReachName} 存在未闭环事件，异常区间以研判时间线为准`
            : `无关联活动事件，展示${sourceDesc}（阈值 ${metric.limits[0]?.value ?? 60} NTU）`
          : `展示${sourceDesc}（近 ${labels.length} 个观测点）。`;

  const emptyText =
    metric.historyKind === 'snapshot'
      ? '历史数据不足 · 仅最新官方快照'
      : labels.length === 0
        ? range === '24h'
          ? '近 24 小时暂无观测'
          : '近 7 天暂无观测记录'
        : '暂无历史观测';

  return (
    <Panel
      code="02"
      title={`${metric.label} · 变化趋势`}
      en={`${metric.en} TREND`}
      className="v2-analysis-trend-panel"
      actions={
        <Segmented
          ariaLabel="切换分析时间范围"
          value={range}
          onChange={(v) => onRangeChange(demoOnly24h && v === '7d' ? '24h' : v)}
          options={[
            { value: '24h', label: '近 24 小时' },
            { value: '7d', label: demoOnly24h ? '近 7 天（演示仅 24h）' : '近 7 天' },
          ]}
        />
      }
    >
      <div className="v2-analysis-station-bar">
        <div className="v2-analysis-station-toggles">
          {stations.map((station) => {
            const isActive = station.id === selectedStation;
            const value = metric.values[station.id];
            return (
              <button
                key={station.id}
                type="button"
                className={`v2-station-toggle ${isActive ? 'v2-is-active' : ''}`.trim()}
                onClick={() => onSelectStation(station.id)}
                aria-pressed={isActive}
                style={
                  {
                    '--station-color': STATION_COLORS[station.id],
                  } as CSSProperties
                }
              >
                <i className="v2-station-toggle__line" />
                <span>{station.name.replace(' 断面', '')}</span>
                <b className="v2-mono">
                  {value !== null ? value.toFixed(metric.precision) : '—'}
                  {metric.unit && value !== null && <em>{metric.unit}</em>}
                </b>
                {metric.historyKind === 'snapshot' && value !== null && (
                  <i className="v2-snapshot-mark" title={metric.snapshotNote}>官方快照</i>
                )}
              </button>
            );
          })}
        </div>
        <div className="v2-analysis-range-note">
          {metric.normalRange ? `参考范围 ${metric.normalRange[0]} – ${metric.normalRange[1]}${metric.unit ? ` ${metric.unit}` : ''}` : '暂无参考范围口径'}
          <span className="v2-mono">{demoLabel}</span>
        </div>
      </div>

      {hasSeries ? (
        <AnalysisTrendChart
          labels={labels}
          series={series}
          unit={metric.unit}
          limits={metric.limits}
          eventWindow={eventWindow}
          selected={selectedStation}
          decimals={metric.precision}
        />
      ) : (
        <div className="v2-analysis-trend-empty" role="img" aria-label={emptyText}>
          <span className="v2-analysis-trend-empty__wave"><i /><i /><i /></span>
          <span className="v2-analysis-trend-empty__text">{emptyText}</span>
          {metric.historyKind === 'snapshot' && (
            <span className="v2-analysis-trend-empty__hint">
              {metric.snapshotNote} · 图例数值为各断面最新官方快照（未伪造曲线）
            </span>
          )}
        </div>
      )}

      <div className="v2-analysis-note">
        <span
          className={`v2-status-dot ${
            metric.key === 'turbidity' ? 'v2-status-dot--danger' : 'v2-status-dot--idle'
          }`}
        />
        {note}
        <span className="v2-analysis-note__time v2-mono">{demoLabel}</span>
      </div>
    </Panel>
  );
}
