import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { StationId } from '../types';
import type { MetricLimit } from '../features/analysis/analysisTypes';
import { STATION_COLORS } from './colors';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);

const mono = '"Cascadia Code", "JetBrains Mono", Consolas, monospace';

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface AnalysisTrendChartProps {
  labels: string[];
  series: { id: StationId; name: string; data: number[] }[];
  unit: string;
  limits: MetricLimit[];
  eventWindow?: [number, number];
  selected: StationId;
  decimals: number;
}

interface TooltipParam {
  axisValueLabel: string;
  marker: string;
  seriesName: string;
  value: number;
}

function buildOption(props: AnalysisTrendChartProps): echarts.EChartsCoreOption {
  const { labels, series, unit, limits, eventWindow, selected, decimals } = props;
  const keyId = series.some((s) => s.id === selected) ? selected : series[0]?.id;
  const keyIndex = Math.max(
    0,
    series.findIndex((s) => s.id === keyId),
  );

  return {
    animationDuration: 700,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: mono },
    grid: { left: 4, right: 18, top: 30, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: 'rgba(160,230,230,0.3)', width: 1, type: 'dashed' },
      },
      backgroundColor: 'rgba(4,20,27,0.96)',
      borderColor: 'rgba(120,205,210,0.24)',
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: '#e3f4f1', fontSize: 11, fontFamily: mono },
      extraCssText:
        'backdrop-filter: blur(12px); box-shadow: 0 14px 44px -14px rgba(0,0,0,0.9); border-radius: 2px;',
      formatter: (params: unknown) => {
        const list = params as TooltipParam[];
        if (!list?.length) return '';
        const rows = list
          .map(
            (p) =>
              `<div style="display:flex;align-items:center;gap:10px;margin-top:5px;">${p.marker}<span style="color:#9fbdc3;min-width:46px;">${p.seriesName}</span><b style="color:#eaf7f5;font-weight:600;">${p.value?.toFixed?.(decimals)}</b><span style="color:#7fa4ab;font-size:9px;">${unit}</span></div>`,
          )
          .join('');
        return `<div style="font-size:9px;letter-spacing:.14em;color:#7fa4ab;">${list[0].axisValueLabel}</div>${rows}`;
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(120,205,210,0.14)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#71969e',
        fontSize: 9,
        margin: 14,
        interval: Math.max(0, Math.ceil(labels.length / 7) - 1),
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: unit || undefined,
      nameGap: 18,
      nameTextStyle: { color: '#628891', fontSize: 9, align: 'right' },
      splitNumber: 4,
      axisLabel: {
        color: '#71969e',
        fontSize: 9,
        margin: 10,
        formatter: (value: number) => value.toFixed(decimals),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(120,205,210,0.07)', type: 'dashed' } },
    },
    series: series.map((s, index) => {
      const color = STATION_COLORS[s.id] ?? '#4fe6d2';
      const isKey = index === keyIndex;
      return {
        name: s.name,
        type: 'line',
        data: s.data,
        smooth: 0.3,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 6,
        z: isKey ? 6 : 3,
        lineStyle: {
          width: isKey ? 2.2 : 1.2,
          color,
          opacity: isKey ? 1 : 0.55,
          shadowColor: color,
          shadowBlur: isKey ? 16 : 0,
        },
        itemStyle: { color },
        emphasis: { focus: 'series', lineStyle: { width: 2.4, opacity: 1 } },
        areaStyle: isKey
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: withAlpha(color, 0.22) },
                { offset: 1, color: withAlpha(color, 0) },
              ]),
            }
          : undefined,
        markLine:
          index === keyIndex && limits.length > 0
            ? {
                silent: true,
                symbol: 'none',
                data: limits.map((limit) => ({
                  yAxis: limit.value,
                  label: {
                    formatter: limit.label,
                    position: 'insideEndTop',
                    distance: 4,
                    color: '#c99d58',
                    fontSize: 9,
                    fontFamily: mono,
                  },
                })),
                lineStyle: {
                  color: 'rgba(255,196,107,0.42)',
                  type: 'dashed',
                  width: 1,
                },
              }
            : undefined,
        markArea:
          index === keyIndex && eventWindow
            ? {
                silent: true,
                itemStyle: { color: 'rgba(255,111,94,0.055)' },
                label: {
                  show: true,
                  position: 'insideTop',
                  distance: 10,
                  color: 'rgba(255,150,135,0.8)',
                  fontSize: 9,
                  fontFamily: mono,
                  formatter: '异常区间',
                },
                data: [
                  [
                    { xAxis: labels[eventWindow[0]] },
                    { xAxis: labels[eventWindow[1]] },
                  ],
                ],
              }
            : undefined,
      };
    }),
  };
}

export function AnalysisTrendChart(props: AnalysisTrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

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
    chartRef.current?.setOption(buildOption(props), true);
  }, [props]);

  return (
    <div
      ref={containerRef}
      className="v2-analysis-chart"
      role="img"
      aria-label={`${props.labels[0]} 至 ${props.labels[props.labels.length - 1]} 的多断面指标趋势图`}
    />
  );
}
