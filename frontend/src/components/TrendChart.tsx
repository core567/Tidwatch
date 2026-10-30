import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { TrendBuildResult } from '@/lib/reachTrends';

interface Props {
  data: TrendBuildResult;
  unit: string;
  height?: number;
  /** 越限阈值线（来自 demo-rules，非真实防汛标准）。 */
  thresholds?: { value: number; label: string; color: string }[];
  /**
   * X 轴范围模式：
   * - full（默认）完整查询窗口，保留右侧长缺测，表达真实覆盖；
   * - focus 聚焦有效数据（实际首末观测+留白），便于阅读曲线。
   */
  viewMode?: 'full' | 'focus';
}

/**
 * 多断面趋势图：
 * - 数据已由 buildReachTrends 用 null 分段，缺测天然断线；
 * - 折线本身不渲染 symbol，越限点只出现在“异常标记”散点序列；
 *   自定义 tooltip 对同一时刻同一断面去重，杜绝每个断面出现两行；
 * - 阈值标签放在图内左上/右下安全区并加底色，避免被右边界裁切。
 */
export default function ReachTrendChart({ data, unit, height = 360, thresholds = [], viewMode = 'full' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const xRange = viewMode === 'focus' ? data.xRangeFocus : data.xRangeFull;

  const option = useMemo(() => {
    const visibleLines = data.lines.filter((l) => !hidden[l.reachId]);
    const visibleReach = new Set(visibleLines.map((l) => l.reachId));

    const lineSeries = data.lines.map((line) => ({
      name: line.reachName,
      type: 'line' as const,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { width: 2, color: line.color },
      itemStyle: { color: line.color },
      // 折线不参与默认 tooltip（统一交给自定义 formatter，避免与散点重复）
      tooltip: { show: false },
      emphasis: { disabled: false },
      data: line.points.map((p) => [p.t, p.value]),
      z: 2,
    }));

    // 异常点单独成一个散点序列（全断面合并），颜色按断面
    const outlierPoints = data.outliers
      .filter((o) => visibleReach.has(o.reachId))
      .map((o) => ({
        value: [o.t, o.value],
        itemStyle: {
          color: data.lines.find((l) => l.reachId === o.reachId)?.color ?? '#d84c4c',
          borderColor: '#fff',
          borderWidth: 1,
        },
        meta: o,
      }));

    const series: Record<string, unknown>[] = [
      ...lineSeries,
      {
        id: 'outliers',
        type: 'scatter',
        name: '异常点',
        symbolSize: 9,
        data: outlierPoints,
        z: 5,
        // 散点本身也不弹默认框，统一由 axis tooltip 聚合
        tooltip: { show: false },
      },
    ];

    if (thresholds.length) {
      series.push({
        id: 'thresholds',
        type: 'line',
        data: [],
        markLine: {
          silent: true,
          symbol: 'none',
          animation: false,
          label: {
            position: 'insideStartTop',
            fontSize: 11,
            fontWeight: 600,
            padding: [3, 7],
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 4,
          },
          data: thresholds.map((t) => ({
            yAxis: t.value,
            lineStyle: { color: t.color, type: 'dashed' as const, width: 1.5 },
            label: { color: t.color, formatter: t.label },
          })),
        },
      });
    }

    return {
      animationDuration: 180,
      grid: { left: 58, right: 28, top: 44, bottom: 56, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#94a3b8', type: 'dashed' } },
        borderColor: '#e2e8f0',
        padding: [8, 12],
        textStyle: { fontSize: 12, color: '#1d2b3a' },
        formatter: (params: { axisValue?: number }[]) => formatTooltip(params, data, unit, hidden),
      },
      legend: {
        show: false, // 使用自定义可点击图例
      },
      xAxis: {
        type: 'time',
        min: xRange?.min,
        max: xRange?.max,
        axisLabel: { fontSize: 11, color: '#5d7186', hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: { fontSize: 11, color: '#5d7186', padding: [0, 0, 4, -30] },
        scale: true,
        axisLabel: { fontSize: 11, color: '#5d7186' },
        splitLine: { lineStyle: { color: '#eef2f7' } },
      },
      series,
    };
  }, [data, unit, thresholds, hidden, viewMode, xRange]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.setOption(option as never);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [option]);

  return (
    <div>
      {/* 自定义图例：点击切换断面，不改动原始数据 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '2px 0 10px' }}>
        {data.lines.map((line) => {
          const off = hidden[line.reachId];
          return (
            <button
              key={line.reachId}
              type="button"
              onClick={() => setHidden((h) => ({ ...h, [line.reachId]: !h[line.reachId] }))}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: 'none', background: 'transparent', cursor: 'pointer',
                padding: 0, fontSize: 13, fontWeight: 600,
                color: off ? '#94a3b8' : '#1d2b3a',
              }}
            >
              <span style={{ width: 16, height: 4, borderRadius: 2, background: off ? '#cbd5e1' : line.color, display: 'inline-block' }} />
              {line.reachName}
            </button>
          );
        })}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#1d2b3a' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px #cbd5e1', background: 'linear-gradient(135deg,#1e6fe0,#e8902a)', display: 'inline-block' }} />
          异常点
        </span>
      </div>
      <div ref={ref} style={{ width: '100%', height }} />
    </div>
  );
}

/** 自定义 Tooltip：每个可见断面最多一行，带时间/单位/来源/异常，杜绝重复行与无意义 '-'。 */
function formatTooltip(
  params: { axisValue?: number }[],
  data: TrendBuildResult,
  unit: string,
  hidden: Record<string, boolean>,
): string {
  const axisT = params?.[0]?.axisValue;
  if (axisT == null) return '';
  const t = Number(axisT);
  const date = new Date(t);
  const head = formatFull(date);

  // 在该时刻附近（容差 1ms / 同点）收集每个断面的值；散点异常信息合并到同一行
  const rows: string[] = [];
  for (const line of data.lines) {
    if (hidden[line.reachId]) continue;
    // 找最接近该 x 的真实值点（跳过 null）
    let best: { value: number; obs: NonNullable<(typeof line.points)[number]['obs']> } | null = null;
    for (const p of line.points) {
      if (p.value === null || !p.obs) continue;
      if (p.t === t) { best = { value: p.value, obs: p.obs }; break; }
      if (!best) best = { value: p.value, obs: p.obs };
    }
    if (!best) continue;
    const isOutlier = data.outliers.some((o) => o.reachId === line.reachId && o.t === t);
    const src = best.obs.sourceType === 'SIMULATED' ? '模拟' : best.obs.sourceType === 'MANUAL' ? '人工' : best.obs.sourceType;
    const evId = (best.obs as { eventId?: string | null }).eventId;
    const abnormal = isOutlier ? '<span style="color:#d84c4c;font-weight:700"> · 越限</span>' : '';
    const eventTxt = evId ? `<span style="color:#1e6fe0"> · ${evId}</span>` : '';
    rows.push(
      `<div style="display:flex;align-items:center;gap:6px;margin-top:3px">` +
        `<span style="width:8px;height:8px;border-radius:50%;background:${line.color};display:inline-block"></span>` +
        `<span style="color:#5d7186">${line.reachName}</span>` +
        `<b style="margin-left:auto">${best.value} ${unit}</b>` +
        `<span style="color:#94a3b8;font-weight:400">${src}</span>` +
        `${abnormal}${eventTxt}` +
      `</div>`,
    );
  }
  if (!rows.length) return '';
  return `<div style="font-weight:700;margin-bottom:2px">${head}</div>${rows.join('')}`;
}

function formatFull(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
