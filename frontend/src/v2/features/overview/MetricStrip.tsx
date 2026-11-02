import type { MetricReadout, Station, StationId } from '../../types';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { Segmented } from '../../components/ui/Segmented';
import { Sparkline } from '../../components/ui/Sparkline';

interface MetricStripProps {
  stations: Station[];
  metrics: Record<StationId, MetricReadout[]>;
  selected: StationId;
  onSelect: (id: StationId) => void;
}

const dotTone: Record<Station['tone'], string> = {
  good: '',
  watch: 'v2-status-dot--warn',
  alert: 'v2-status-dot--danger',
};

/** 真实浊度阈值来自后端规则 thresholds.py（turbidity_muddy = 60 NTU）。 */
const TURBIDITY_THRESHOLD = 60;

export function MetricStrip({ stations, metrics, selected, onSelect }: MetricStripProps) {
  const station = stations.find((s) => s.id === selected) ?? stations[0];
  const readings = metrics[selected];

  return (
    <section className="v2-panel v2-metric-strip">
      <div className="v2-metric-strip__head">
        <div className="v2-metric-strip__head-main">
          <span className="v2-panel__code">03</span>
          <h2 className="v2-panel__title">水环境实时指标</h2>
          <span className="v2-panel__en">REAL-TIME METRICS</span>
        </div>
        <div className="v2-metric-strip__context">
          <span className="v2-metric-strip__station">
            <span className={`v2-status-dot ${dotTone[station.tone]}`} />
            {station.name.replace(' 断面', '')}
            {station.waterClass ? ` · ${station.waterClass} 类水` : ' · 水质暂无'}
          </span>
          <Segmented
            ariaLabel="切换监测断面"
            mini
            value={selected}
            onChange={onSelect}
            options={stations.map((s) => ({ value: s.id, label: s.id }))}
          />
          <span className="v2-metric-strip__updated v2-mono">更新 {station.updatedAt}</span>
        </div>
      </div>

      <div className="v2-metric-strip__grid">
        {readings.map((m) => {
          const hasValue = m.value !== null && Number.isFinite(m.value);
          const outside =
            hasValue && m.normalRange
              ? (m.value as number) < m.normalRange[0] || (m.value as number) > m.normalRange[1]
              : false;
          const hasDelta = m.deltaPct !== null && Number.isFinite(m.deltaPct);
          const watch = hasDelta && !outside && Math.abs(m.deltaPct as number) >= 20;
          const tone = outside ? 'alert' : watch ? 'watch' : 'neutral';
          const deltaClass = outside ? 'v2-is-alert' : watch ? 'v2-is-watch' : '';
          const arrow = hasDelta
            ? (m.deltaPct as number) > 0
              ? '▲'
              : (m.deltaPct as number) < 0
                ? '▼'
                : '—'
            : '—';
          const stale = m.stale === true && m.source === '官方自动站';
          const flag = outside ? '超阈值' : watch ? '关注' : null;

          return (
            <div
              className={`v2-metric ${outside ? 'v2-is-alert' : ''} ${
                watch ? 'v2-is-watch' : ''
              } ${stale ? 'v2-is-stale' : ''}`.trim()}
              key={`${selected}-${m.key}`}
              title={
                m.normalRange
                  ? `参考范围 ${m.normalRange[0]} – ${m.normalRange[1]} ${m.unit}`
                  : '暂无参考范围'
              }
            >
              <div className="v2-metric__top">
                <span className="v2-metric__label">{m.label}</span>
                <span className="v2-metric__en">{m.en}</span>
                {flag && (
                  <span
                    className={`v2-metric__flag ${
                      outside ? 'v2-metric__flag--alert' : 'v2-metric__flag--watch'
                    }`}
                  >
                    {flag}
                  </span>
                )}
              </div>
              <div className="v2-metric__value">
                {hasValue ? (
                  <AnimatedNumber
                    value={m.value as number}
                    decimals={m.precision}
                    className="v2-metric__num v2-display"
                  />
                ) : (
                  <span className="v2-metric__num v2-display">—</span>
                )}
                {m.unit && <span className="v2-metric__unit">{m.unit}</span>}
              </div>
              <div className="v2-metric__foot">
                <span className={`v2-metric__delta v2-mono ${deltaClass}`.trim()}>
                  {hasDelta ? `${arrow} ${Math.abs(m.deltaPct as number).toFixed(1)}%` : '环比 —'}
                </span>
                <Sparkline
                  values={m.spark}
                  width={104}
                  height={26}
                  tone={tone}
                  threshold={m.key === 'turbidity' ? TURBIDITY_THRESHOLD : undefined}
                  animate
                />
              </div>
              {(m.observedAt || m.source) && (
                <div className="v2-metric__time v2-mono">
                  {m.source ? (
                    <>
                      {m.source}
                      {m.stale ? ' · 陈旧数据' : ''}
                      {m.observedAt ? <> · 观测 {m.observedAt.slice(5, 16).replace('T', ' ')}</> : null}
                    </>
                  ) : (
                    <>观测 {m.observedAt?.slice(5, 16).replace('T', ' ')}</>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
