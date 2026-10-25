import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Segmented, Tag } from '@/components/ui';
import { reachName } from '@/components/EventBits';
import SourceTag from '@/components/SourceTag';
import { compareRange, splitPhases } from '@/lib/comparePhases';
import type { Observation, RecoveryAssessment } from '@/types/contract';

const REACHES = ['reach-a', 'reach-b', 'reach-c'];
const METRICS = [
  { key: 'waterLevel', label: '水位' },
  { key: 'turbidity', label: '浊度' },
  { key: 'flowLevel', label: '水流等级' },
];
const UNIT: Record<string, string> = { waterLevel: 'm', turbidity: 'NTU', flowLevel: '级' };
const WINDOW_MIN = 60;

type Phase = 'BASELINE' | 'ANOMALY' | 'POST';
const PHASE_CN: Record<Phase, string> = {
  BASELINE: '异常前基线',
  ANOMALY: '异常期间',
  POST: '处置后',
};

/**
 * 处置前后三段观测对比（只呈现事实）。
 * 时间锚点完全来自 F1 恢复评估：APPROVED 复核时间优先，其次恢复相关状态迁移；
 * 无锚点时不切处置后段、不出前后结论。
 */
export default function ObservationCompare({
  eventId,
  assessment,
}: {
  eventId: string;
  assessment?: RecoveryAssessment;
}) {
  const [reach, setReach] = useState('reach-a');
  const [metric, setMetric] = useState('waterLevel');

  const anchorAt = assessment?.anchor.at ?? null;

  // 事件首现：从评估窗口不易拿，改用事件详情由父级；这里直接用 anchor + 观测整体范围。
  // 为独立可用，单独取事件。
  const eventQ = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.event(eventId),
  });

  const anchorMs = anchorAt ? Date.parse(anchorAt) : null;
  const firstMs = eventQ.data?.firstSeenAt ? Date.parse(eventQ.data.firstSeenAt) : null;

  const range = useMemo(
    () => compareRange(firstMs, anchorMs, WINDOW_MIN),
    [firstMs, anchorMs],
  );

  const obsQ = useQuery({
    queryKey: ['compare-obs', reach, metric, range?.start, range?.end],
    queryFn: () =>
      api.observations(reach, {
        metric,
        from: range!.start,
        to: range!.end,
        order: 'asc',
        pageSize: 500,
      }),
    enabled: !!range,
  });

  const rows = (obsQ.data?.items ?? []) as Observation[];
  const good = rows.filter((r) => r.qualityFlag === 'GOOD');
  const badCount = rows.length - good.length;

  const phases = useMemo(
    () => (firstMs == null ? null : splitPhases(good, firstMs, anchorMs)),
    [good, firstMs, anchorMs],
  );

  const anchorMissing = anchorMs == null;

  return (
    <div className="tw-compare">
      <div className="tw-filter-bar" style={{ marginBottom: 10 }}>
        <Segmented
          ariaLabel="选择断面"
          value={reach}
          onChange={setReach}
          options={REACHES.map((r) => ({ value: r, label: reachName(r) }))}
        />
        <Segmented
          ariaLabel="选择指标"
          value={metric}
          onChange={setMetric}
          options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
        />
        <SourceTag source="SIMULATED" />
      </div>

      {eventQ.data && !eventQ.data.scopeReachIds.includes(reach as never) && (
        <div className="tw-tiny" style={{ marginBottom: 8 }}>
          注：{reachName(reach)} 不在本事件记录的涉及范围内，数据仅作参考。
        </div>
      )}

      {anchorMissing && (
        <div className="tw-anchor-missing">
          ⚠ 处置后时间锚点缺失：无 APPROVED 复核时间，也无恢复相关状态迁移。
          以下仅展示异常前基线与异常期间，<b>不生成处置前后结论</b>。
        </div>
      )}
      {!anchorMissing && assessment?.anchor.source !== 'task_review.approved' && (
        <div className="tw-tiny" style={{ marginBottom: 8, color: 'var(--tw-watch)' }}>
          锚点来自恢复相关状态迁移时间（{assessment?.anchor.note ?? ''}），并非人工复核确认的处置完成时刻；处置后结论需谨慎。
        </div>
      )}

      {obsQ.isLoading && <div className="tw-tiny" style={{ padding: 12 }}>观测加载中…</div>}
      {obsQ.isError && (
        <div className="tw-tiny" style={{ padding: 12, color: 'var(--tw-danger)' }}>
          观测加载失败：{(obsQ.error as ApiError)?.message}
        </div>
      )}

      {phases && (
        <>
          <CompareChart
            rows={good}
            unit={UNIT[metric]}
            firstMs={firstMs}
            anchorMs={anchorMs}
          />
          <div className="tw-phase-grid">
            {(['BASELINE', 'ANOMALY', 'POST'] as Phase[]).map((p) => {
              const s = phases[p];
              const missing = s.count === 0 || (p === 'POST' && anchorMissing);
              return (
                <div key={p} className={`tw-phase-card ${p === 'POST' && anchorMissing ? 'is-na' : ''}`}>
                  <div className="tw-phase-title">
                    {PHASE_CN[p]}
                    {p === 'POST' && anchorMissing && <Tag tone="muted">无锚点</Tag>}
                  </div>
                  {missing ? (
                    <div className="tw-tiny">
                      {p === 'POST' && anchorMissing ? '处置锚点缺失，无法界定' : '该窗口无有效观测（数据不足）'}
                    </div>
                  ) : (
                    <>
                      <div className="tw-phase-median">{s.median?.toFixed(2)} <span className="tw-tiny">{UNIT[metric]}</span></div>
                      <div className="tw-tiny">样本 {s.count} · 中位数</div>
                      <div className="tw-tiny">{fmt(s.start)} ~ {fmt(s.end)}</div>
                      <div className="tw-tiny">来源 MQTT 模拟 · 质量 GOOD</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {badCount > 0 && <div className="tw-tiny" style={{ marginTop: 6 }}>已剔除 {badCount} 条非 GOOD 质量观测。</div>}
          <div className="tw-tiny" style={{ marginTop: 6 }}>
            本图只描述实际观测变化（事实层）；是否支持恢复由“恢复评估”按规则判定，二者相互独立。
          </div>
        </>
      )}
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function CompareChart({
  rows,
  unit,
  firstMs,
  anchorMs,
}: {
  rows: Observation[];
  unit: string;
  firstMs: number | null;
  anchorMs: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(
    () => rows.map((r) => [Date.parse(r.observedAt), r.value]),
    [rows],
  );
  const markLines: Record<string, unknown>[] = [];
  if (firstMs != null)
    markLines.push({ xAxis: firstMs, name: '异常发生', lineStyle: { color: '#e8902a', type: 'solid' as const, width: 1.5 }, label: { color: '#e8902a', formatter: '异常' } });
  if (anchorMs != null)
    markLines.push({ xAxis: anchorMs, name: '处置锚点', lineStyle: { color: '#12a594', type: 'dashed' as const, width: 1.5 }, label: { color: '#12a594', formatter: '处置' } });

  const markAreaData: unknown[] = firstMs != null
    ? [[
        { xAxis: firstMs, itemStyle: { color: 'rgba(232,144,42,0.08)' } },
        { xAxis: anchorMs ?? firstMs },
      ]]
    : [];

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.setOption({
      grid: { left: 52, right: 20, top: 30, bottom: 40 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time', axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', name: unit, scale: true },
      series: [
        {
          name: unit,
          type: 'line',
          showSymbol: data.length <= 60,
          symbolSize: 5,
          smooth: true,
          lineStyle: { width: 2, color: '#1e6fe0' },
          itemStyle: { color: '#1e6fe0' },
          data,
          markArea: { silent: true, data: markAreaData },
          markLine: { silent: true, symbol: 'none', data: markLines, label: { fontSize: 10 } },
        },
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [data, unit, firstMs, anchorMs, markAreaData, markLines]);

  return <div ref={ref} style={{ width: '100%', height: 300 }} />;
}
