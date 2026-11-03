import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Observation } from '@/types/contract';
import type { ChartWindow } from './useEventDossier';
import { timeMs } from './useEventDossier';
import type { RiskTone } from './reviewModel';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import {
  chartAnimation,
  chartFont,
  chartGrid,
  chartText,
  chartTooltipBase,
} from '../../charts/chartTheme';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

const TONE_COLOR: Record<RiskTone, string> = {
  high: '#ff6f5e',
  medium: '#ffc46b',
  low: '#4fe6d2',
};

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface ChartPoint {
  label: string;
  value: number;
  ms: number;
}

function buildPoints(observations: Observation[]): ChartPoint[] {
  const valid = observations.filter(
    (o) => o.qualityFlag !== 'INVALID' && o.qualityFlag !== 'MISSING' && Number.isFinite(o.value),
  );
  const stride = Math.max(1, Math.ceil(valid.length / 220));
  const points: ChartPoint[] = [];
  valid.forEach((o, index) => {
    if (index % stride !== 0 && index !== valid.length - 1) return;
    points.push({
      label: o.observedAt.slice(5, 16).replace('T', ' '),
      value: o.value,
      ms: timeMs(o.observedAt),
    });
  });
  return points;
}

function option(
  points: ChartPoint[],
  window: ChartWindow,
  unit: string,
  tone: RiskTone,
  reducedMotion: boolean,
): echarts.EChartsCoreOption {
  const color = TONE_COLOR[tone];
  const labels = points.map((p) => p.label);
  const values = points.map((p) => p.value);
  const startMs = timeMs(window.start);
  const endMs = timeMs(window.end);
  const windowStart = points.findIndex((p) => p.ms >= startMs);
  const windowEnd = points.findIndex((p) => p.ms >= endMs);
  const eventFrom = windowStart >= 0 ? windowStart : 0;
  const eventTo = windowEnd >= 0 ? windowEnd : labels.length - 1;

  const windowValues = points
    .filter((p) => p.ms >= startMs && p.ms <= endMs)
    .map((p) => p.value);
  const peak = windowValues.length ? Math.max(...windowValues) : null;
  const peakIndex = peak === null ? -1 : values.indexOf(peak);

  const thresholdLines = (() => {
    if (window.threshold === null) return [];
    const list = Array.isArray(window.threshold) ? window.threshold : [window.threshold];
    return list.map((value, i) => ({
      yAxis: value,
      label: {
        formatter: `${Array.isArray(window.threshold) ? (i === 0 ? '下限 ' : '上限 ') : '阈值 '}${value}`,
        color: '#c99d58',
        fontSize: 8,
        fontFamily: chartFont,
        position: i === 0 ? 'insideEndBottom' : 'insideEndTop',
        distance: 4,
      },
      lineStyle: {
        color: 'rgba(255,196,107,0.42)',
        type: 'dashed' as const,
        width: 1,
      },
    }));
  })();

  const labelStep = Math.max(1, Math.ceil(labels.length / 7));

  return {
    ...chartAnimation,
    animation: !reducedMotion,
    animationDuration: reducedMotion ? 0 : 800,
    textStyle: { fontFamily: chartFont },
    grid: { left: 8, right: 24, top: 42, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: chartGrid.axisPointer, width: 1, type: 'dashed' },
      },
      ...chartTooltipBase,
      formatter: (params: unknown) => {
        const list = params as { axisValueLabel: string; marker: string; value: number }[];
        if (!list?.length) return '';
        const item = list[0];
        return `<div style="font-size:9px;letter-spacing:.14em;color:${chartText.muted};">${item.axisValueLabel}</div><div style="display:flex;align-items:center;gap:10px;margin-top:5px;">${item.marker}<span style="color:${chartText.tooltipBody};">实测值</span><b style="color:${chartText.strong};font-weight:600;">${Number(item.value).toFixed(2)}</b><span style="color:${chartText.muted};font-size:9px;">${unit}</span></div>`;
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: chartGrid.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: chartText.axis,
        fontSize: 9,
        fontFamily: chartFont,
        margin: 12,
        interval: labelStep - 1,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: unit,
      nameGap: 20,
      nameTextStyle: { color: chartText.axisName, fontSize: 9, align: 'right' as const },
      splitNumber: 4,
      axisLabel: {
        color: chartText.axis,
        fontSize: 9,
        margin: 10,
        formatter: (value: number) => value.toFixed(1),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: chartGrid.splitLine, type: 'dashed' } },
    },
    series: [
      {
        name: '实测值',
        type: 'line',
        data: values,
        smooth: 0.28,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 6,
        z: 5,
        lineStyle: { width: 2.2, color, shadowColor: color, shadowBlur: 14 },
        itemStyle: { color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(color, 0.2) },
            { offset: 1, color: withAlpha(color, 0) },
          ]),
        },
        markPoint:
          peak !== null && peakIndex >= 0
            ? {
                silent: true,
                symbol: 'circle',
                symbolSize: 7,
                data: [{ coord: [labels[peakIndex], peak] }],
                itemStyle: { color, borderColor: '#031017', borderWidth: 2 },
                label: {
                  show: true,
                  position: 'top',
                  distance: 8,
                  formatter: `峰值 ${peak.toFixed(2)} ${unit}`,
                  color: '#eaf7f5',
                  fontSize: 9,
                  fontFamily: chartFont,
                  backgroundColor: 'rgba(4,20,27,0.85)',
                  borderColor: 'rgba(120,205,210,0.2)',
                  borderWidth: 1,
                  padding: [3, 6],
                },
              }
            : undefined,
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            ...(window.baseline !== null
              ? [
                  {
                    yAxis: window.baseline,
                    label: {
                      formatter: `基线 ${window.baseline}`,
                      position: 'insideEndTop' as const,
                      color: '#6f9fc9',
                      fontSize: 8,
                      fontFamily: chartFont,
                    },
                    lineStyle: { color: 'rgba(111,159,201,0.5)', type: 'dotted' as const, width: 1 },
                  },
                ]
              : []),
            ...thresholdLines,
          ],
        },
        markArea:
          labels.length > 1
            ? {
                silent: true,
                itemStyle: { color: 'rgba(255,111,94,0.055)' },
                label: {
                  show: true,
                  position: 'insideTopLeft' as const,
                  distance: 8,
                  color: 'rgba(255,150,135,0.75)',
                  fontSize: 8,
                  fontFamily: chartFont,
                  formatter: '异常区间',
                },
                data: [[{ xAxis: labels[eventFrom] }, { xAxis: labels[eventTo] }]],
              }
            : undefined,
      },
    ],
  };
}

export function ReviewTrendChart({
  observations,
  window,
  unit,
  tone,
  loading,
}: {
  observations: Observation[];
  window: ChartWindow | null;
  unit: string;
  tone: RiskTone;
  loading: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const points = useMemo(() => buildPoints(observations), [observations]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!window || points.length < 2) {
      chartRef.current?.clear();
      return;
    }
    chartRef.current?.setOption(option(points, window, unit, tone, reducedMotion), true);
  }, [points, window, unit, tone, reducedMotion]);

  const empty = !loading && points.length < 2;

  return (
    <div className="v2-report-chart">
      <div
        ref={containerRef}
        className="v2-report-chart__canvas"
        role="img"
        aria-label={
          points.length
            ? `${unit || ''}处置前后趋势，${points[0].label} 至 ${points[points.length - 1].label}`
            : '处置前后趋势，暂无观测数据'
        }
      />
      {empty && (
        <div className="v2-report-chart__empty">
          <span className="v2-report-chart__wave"><i /><i /><i /></span>
          <span>{loading ? '观测数据加载中…' : '该事件窗口暂无观测数据'}</span>
        </div>
      )}
    </div>
  );
}
