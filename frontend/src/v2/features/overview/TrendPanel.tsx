import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TrendDataset, StationId } from '../../types';
import { TrendChart } from '../../charts/TrendChart';
import { Panel } from '../../components/ui/Panel';
import { Segmented } from '../../components/ui/Segmented';
import { Icon } from '../../components/ui/Icon';

const colors: Record<StationId, string> = {
  A: '#5aa9ff',
  B: '#ff6f5e',
  C: '#4fe6d2',
};

interface TrendPanelProps {
  trend: { '24h': TrendDataset; '7d': TrendDataset };
  eventId?: string;
  /** 当前头号预警对应断面的显示名（来自真实事件，非硬编码） */
  leadReachName?: string;
  /** 演示模式：剧本仅 24h，禁用 7d 档并隐藏关联研判入口 */
  demoOnly24h?: boolean;
}

export function TrendPanel({ trend, eventId, leadReachName, demoOnly24h = false }: TrendPanelProps) {
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const dataset = trend[range];
  const lastValue = (s: TrendDataset['series'][number]): string => {
    const tail = s.data.filter((v) => Number.isFinite(v));
    return tail.length > 0 ? tail[tail.length - 1].toFixed(1) : '—';
  };

  return (
    <Panel
      code="04"
      title="浊度变化趋势"
      en="TURBIDITY TREND"
      className="v2-trend-panel"
      actions={
        <>
          <Link to="/analysis" className="v2-panel-link">
            深度分析
            <Icon name="arrow-up-right" size={12} />
          </Link>
          <Segmented
            ariaLabel="切换趋势时间范围"
            value={range}
            onChange={(v) => setRange(demoOnly24h && v === '7d' ? '24h' : v)}
            options={[
              { value: '24h', label: '近 24 小时' },
              { value: '7d', label: demoOnly24h ? '近 7 天（演示仅 24h）' : '近 7 天' },
            ]}
          />
        </>
      }
    >
      <div className="v2-series-legend">
        {dataset.series.map((s) => (
          <span className="v2-series-legend__item" key={s.id}>
            <i className="v2-series-legend__line" style={{ background: colors[s.id] }} />
            {s.name}
            <b className="v2-mono">{lastValue(s)}</b>
          </span>
        ))}
        <span className="v2-series-legend__threshold">
          <i />
          预警阈值 {dataset.threshold} {dataset.unit}
        </span>
      </div>

      <TrendChart dataset={dataset} />

      <div className="v2-trend-panel__note">
        {dataset.labels.length === 0 ? (
          <>
            <span className="v2-status-dot v2-status-dot--idle" />
            {range === '24h' ? '近 24 小时暂无观测' : '近 7 天暂无观测记录'}
          </>
        ) : eventId && leadReachName ? (
          <>
            <span className="v2-status-dot v2-status-dot--danger" />
            {leadReachName} 存在未闭环事件，关联区间以研判时间线为准；图中仅展示真实观测序列与阈值线。
          </>
        ) : (
          <>
            <span className="v2-status-dot" />
            展示各断面真实浊度观测序列（最近 {dataset.labels.length} 个观测点）。
          </>
        )}
        <div className="v2-trend-panel__actions">
          {!demoOnly24h && eventId && (
            <Link
              to={`/events/${encodeURIComponent(eventId)}/workbench`}
              className="v2-trend-event-link"
              title={`查看关联事件 ${eventId} 的研判`}
              aria-label={`查看关联事件 ${eventId} 的研判`}
            >
              关联研判
              <Icon name="arrow-up-right" size={11} />
            </Link>
          )}
          <span className="v2-trend-panel__source v2-mono">REAL OBSERVATIONS</span>
        </div>
      </div>
    </Panel>
  );
}
