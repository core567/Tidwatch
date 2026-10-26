import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import type { Observation } from '@/types/contract';

export interface TrendSeries {
  reachId: string;
  name: string;
  rows: Observation[];
  color: string;
}

interface Props {
  series: TrendSeries[];
  unit: string;
  height?: number;
  /** 越限阈值线（教学规则）。 */
  thresholds?: { value: number; label: string; color: string }[];
  /** 缺测间隔阈值（毫秒）：相邻点超过该间隔则断线，标记缺测区间。 */
  gapMs?: number;
}

const REACH_COLOR: Record<string, string> = {
  'reach-a': '#1e6fe0',
  'reach-b': '#12a594',
  'reach-c': '#e8902a',
};

/**
 * 多断面趋势：connectNulls=false + 按缺测间隔切分序列，缺测不补零、不连线。
 * 越限点单独散点高亮；阈值参考线。
 */
export default function TrendChart({ series, unit, height = 340, thresholds = [], gapMs = 15 * 60 * 1000 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const option = useMemo(() => {
    const lineSeries: Record<string, unknown>[] = [];
    const outlierData: [number, number, string][] = [];
    const thresholdValues = thresholds.map((t) => t.value);

    for (const s of series) {
      const color = s.color || REACH_COLOR[s.reachId] || '#666';
      // 按时间排序后，用 null 分段表达断线（echarts connectNulls=false 会在 null 处断开）
      const pts: (number | null)[][] = [];
      let prevT: number | null = null;
      const sorted = [...s.rows].sort((a, b) => +new Date(a.observedAt) - +new Date(b.observedAt));
      for (const r of sorted) {
        const t = +new Date(r.observedAt);
        if (prevT != null && t - prevT > gapMs) pts.push([prevT, null]); // 缺口标记，触发断线
        pts.push([t, r.value]);
        if (thresholdValues.some((tv) => r.value > tv)) outlierData.push([t, r.value, s.name]);
        prevT = t;
      }
      lineSeries.push({
        name: s.name,
        type: 'line',
        showSymbol: false,
        connectNulls: false,
        smooth: false,
        lineStyle: { width: 2, color },
        itemStyle: { color },
        data: pts,
      });
    }

    if (outlierData.length) {
      lineSeries.push({
        name: '越限点',
        type: 'scatter',
        symbolSize: 7,
        itemStyle: { color: '#d84c4c' },
        data: outlierData.map(([t, v]) => [t, v]),
        tooltip: { formatter: (p: { value: [number, number] }) => `越限 ${p.value[1]} ${unit}` },
      });
    }

    return {
      grid: { left: 54, right: 20, top: 36, bottom: 42 },
      tooltip: { trigger: 'axis' },
      legend: { top: 4, textStyle: { fontSize: 11 } },
      xAxis: { type: 'time', axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', name: unit, scale: true },
      series: [
        ...lineSeries,
        ...(thresholds.length
          ? [{
              type: 'line',
              markLine: {
                silent: true,
                symbol: 'none',
                label: { fontSize: 10 },
                data: thresholds.map((t) => ({
                  yAxis: t.value, name: t.label,
                  lineStyle: { color: t.color, type: 'dashed' as const, width: 1 },
                  label: { color: t.color, formatter: t.label },
                })),
              },
            }]
          : []),
      ],
    };
  }, [series, unit, thresholds, gapMs]);

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

  return <div ref={ref} style={{ width: '100%', height }} />;
}
