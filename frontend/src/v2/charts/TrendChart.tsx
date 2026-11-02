import { useEffect, useRef } from 'react';
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
import type { TrendDataset } from '../types';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import {
  chartAnimation,
  chartColors,
  chartFont,
  chartGrid,
  chartText,
  chartTooltipBase,
  makeTrendTooltip,
} from './chartTheme';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

function buildOption(
  dataset: TrendDataset,
  reducedMotion = false,
): echarts.EChartsCoreOption {
  const { labels, series, threshold, eventWindow, unit } = dataset;
  const keySeries = series.find((item) => item.id === 'B');
  const hasPeak = keySeries ? keySeries.data.some((v) => Number.isFinite(v)) : false;
  const peakValue = hasPeak ? Math.max(...keySeries!.data.filter((v) => Number.isFinite(v))) : 0;
  const peakIndex = hasPeak ? keySeries!.data.indexOf(peakValue) : 0;
  const hasEventWindow = eventWindow[0] >= 0 && eventWindow[1] >= 0 && eventWindow[0] < labels.length && eventWindow[1] < labels.length;
  // X 轴标签抽稀：按点数步进控制可见刻度 ≈8 个，真实时间戳原样显示，不删除观测点
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));

  return {
    ...chartAnimation,
    animationDuration: reducedMotion ? 0 : chartAnimation.duration,
    animationDurationUpdate: reducedMotion ? 0 : 500,
    textStyle: { fontFamily: chartFont },
    grid: { left: 8, right: 24, top: 42, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: chartGrid.axisPointer, width: 1, type: 'dashed' },
      },
      ...chartTooltipBase,
      formatter: makeTrendTooltip(unit, 1, threshold),
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
        margin: 14,
        // interval 为索引步进：每 labelStep 个观测点显示一个刻度，配合 hideOverlap 防重叠
        interval: labelStep - 1,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      name: unit,
      nameGap: 20,
      nameTextStyle: { color: chartText.axisName, fontSize: 10, align: 'right' },
      splitNumber: 4,
      axisLabel: { color: chartText.axis, fontSize: 10, margin: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: chartGrid.splitLine, type: 'dashed' } },
    },
    series: series.map((item, index) => {
      const color =
        chartColors[item.id as keyof typeof chartColors] ?? chartColors.tide;
      const isKey = item.id === 'B';
      return {
        name: item.name,
        type: 'line',
        data: item.data,
        smooth: 0.32,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 6,
        z: isKey ? 5 : 3,
        animationDelay: reducedMotion ? 0 : index * 120,
        lineStyle: {
          width: isKey ? 2.2 : 1.5,
          color,
          shadowColor: color,
          shadowBlur: isKey ? 16 : 6,
          opacity: isKey ? 1 : 0.8,
        },
        itemStyle: { color },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 2.4, opacity: 1 },
        },
        areaStyle: isKey
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(255,111,94,0.24)' },
                { offset: 1, color: 'rgba(255,111,94,0)' },
              ]),
            }
          : undefined,
        markPoint:
          isKey && keySeries && hasPeak
            ? {
                silent: true,
                symbol: 'circle',
                symbolSize: 7,
                data: [{ coord: [labels[peakIndex], peakValue] }],
                itemStyle: {
                  color: '#ff8a7a',
                  borderColor: 'rgba(4,20,27,0.9)',
                  borderWidth: 2,
                  shadowColor: 'rgba(255,111,94,0.6)',
                  shadowBlur: 8,
                },
                label: {
                  show: true,
                  position: 'top',
                  distance: 9,
                  formatter: `峰值 ${peakValue.toFixed(1)} ${unit}`,
                  color: '#ffd9d3',
                  fontSize: 9,
                  fontFamily: chartFont,
                  backgroundColor: 'rgba(30,10,10,0.78)',
                  borderColor: 'rgba(255,111,94,0.28)',
                  borderWidth: 1,
                  padding: [3, 5],
                },
              }
            : undefined,
        markLine:
          isKey && index === 1
            ? {
                silent: true,
                symbol: 'none',
                data: [
                  {
                    yAxis: threshold,
                    label: {
                      formatter: `阈值 ${threshold}`,
                      color: '#c99d58',
                      fontSize: 9,
                      fontFamily: chartFont,
                      position: 'insideEndTop',
                      distance: 4,
                    },
                    lineStyle: {
                      color: 'rgba(255,196,107,0.45)',
                      type: 'dashed',
                      width: 1,
                    },
                  },
                  ...(hasEventWindow
                    ? [
                        {
                          xAxis: labels[eventWindow[0]],
                          label: {
                            formatter: '预警触发',
                            color: '#ff9b8c',
                            fontSize: 8,
                            fontFamily: chartFont,
                            position: 'insideEndTop',
                            distance: 4,
                          },
                          lineStyle: {
                            color: 'rgba(255,111,94,0.3)',
                            type: 'dotted',
                            width: 1,
                          },
                        },
                      ]
                    : []),
                ],
              }
            : undefined,
        markArea:
          isKey && index === 1 && hasEventWindow
            ? {
                silent: true,
                itemStyle: { color: 'rgba(255,111,94,0.055)' },
                label: {
                  show: true,
                  position: 'insideTopLeft',
                  distance: 10,
                  color: 'rgba(255,150,135,0.8)',
                  fontSize: 9,
                  fontFamily: chartFont,
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

export function TrendChart({ dataset }: { dataset: TrendDataset }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const hasData = dataset.labels.length > 0;

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
    chartRef.current?.setOption(buildOption(dataset, reducedMotion), true);
  }, [dataset, reducedMotion]);

  return (
    <div className="v2-trend-chart-wrap">
      <div
        ref={containerRef}
        className="v2-trend-chart"
        role="img"
        aria-label={hasData ? `浊度趋势图，${dataset.labels[0]} 至 ${dataset.labels[dataset.labels.length - 1]}，单位 ${dataset.unit}` : '浊度趋势图，暂无观测数据'}
      />
      {!hasData && (
        <div className="v2-trend-empty" aria-hidden="true">
          <span className="v2-trend-empty__wave">
            <i /><i /><i />
          </span>
          <span className="v2-trend-empty__text">该时间窗暂无观测</span>
        </div>
      )}
    </div>
  );
}
