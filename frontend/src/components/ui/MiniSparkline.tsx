import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface SparkPoint {
  value: number | null;
  label?: string;
}

export interface MiniSparklineProps {
  points: SparkPoint[];
  height?: number;
  color?: string;
  unit?: string;
  emptyText?: string;
}

/** 极简趋势线：仅用于连续序列（MQTT 模拟）；官方离散快照不在图上伪造连续趋势。 */
export default function MiniSparkline({
  points,
  height = 40,
  color = '#1e6fe0',
  unit = '',
  emptyText = '暂无连续数据',
}: MiniSparklineProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const validCount = points.filter((p) => p.value !== null && p.value !== undefined).length;

  useEffect(() => {
    if (validCount < 2 || !ref.current) return;
    const chart = chartRef.current ?? echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.setOption(
      {
        animation: false,
        grid: { left: 2, right: 2, top: 4, bottom: 2 },
        tooltip: {
          trigger: 'axis',
          confine: true,
          formatter: (params: unknown) => {
            const arr = params as { dataIndex: number; value: number; axisValue?: string }[];
            const p = arr[0];
            if (!p) return '';
            const label = points[p.dataIndex]?.label ?? p.axisValue ?? '';
            return `${label}<br/><b>${p.value}</b>${unit ? ` ${unit}` : ''}`;
          },
        },
        xAxis: {
          type: 'category',
          show: false,
          boundaryGap: false,
          data: points.map((p, i) => p.label ?? String(i)),
        },
        yAxis: { type: 'value', show: false, scale: true },
        series: [
          {
            type: 'line',
            data: points.map((p) => p.value),
            showSymbol: false,
            connectNulls: false,
            lineStyle: { width: 1.8, color },
            areaStyle: { color, opacity: 0.1 },
          },
        ],
      },
      true,
    );
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [points, color, unit, validCount]);

  useEffect(
    () => () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    },
    [],
  );

  if (validCount < 2) {
    return (
      <div className="tw-sparkline-empty" style={{ height }}>
        {emptyText}
      </div>
    );
  }
  return <div ref={ref} className="tw-sparkline" style={{ height }} />;
}
