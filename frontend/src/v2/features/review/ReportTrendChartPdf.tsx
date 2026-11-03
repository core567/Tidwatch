import { Circle, Line, Polyline, Rect, Svg, Text, View } from '@react-pdf/renderer';
import type { Observation } from '@/types/contract';

const W = 490;
const H = 194;
const LEFT = 46;
const RIGHT = 478;
const TOP = 18;
const BOTTOM = 150;

function timeMs(iso: string): number {
  const normalized = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  return Date.parse(normalized);
}

function shortTime(iso: string): string {
  return iso.slice(5, 16).replace('T', ' ');
}

function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

interface Props {
  observations: Observation[];
  start: string | null;
  end: string | null;
  baseline: number | null;
  threshold: number | number[] | null;
  unit: string;
  metricLabel: string;
}

/**
 * PDF 内真实趋势图：数据点来自 /reaches/{id}/observations；
 * 基线、阈值来自恢复评估窗口；不使用任何模拟曲线。
 */
export function ReportTrendChart({
  observations,
  start,
  end,
  baseline,
  threshold,
  unit,
  metricLabel,
}: Props) {
  const valid = observations.filter(
    (o) => o.qualityFlag !== 'INVALID' && o.qualityFlag !== 'MISSING' && Number.isFinite(o.value),
  );
  const stride = Math.max(1, Math.ceil(valid.length / 90));
  const points = valid
    .filter((_, index) => index % stride === 0 || index === valid.length - 1)
    .map((o) => ({ ms: timeMs(o.observedAt), value: o.value, at: o.observedAt }))
    .filter((p) => Number.isFinite(p.ms));

  if (points.length < 2) {
    return (
      <View style={{ borderWidth: 1, borderColor: '#c7d5da', borderStyle: 'solid', padding: 18, marginVertical: 8 }}>
        <Text style={{ fontSize: 9, color: '#5d7580' }}>
          {metricLabel}：该事件窗口暂无有效观测数据，不做插值或推测。
        </Text>
      </View>
    );
  }

  const minMs = points[0].ms;
  const maxMs = points[points.length - 1].ms;
  const spanMs = Math.max(1, maxMs - minMs);
  const thresholdList = threshold === null ? [] : Array.isArray(threshold) ? threshold : [threshold];
  const values = [...points.map((p) => p.value), ...(baseline === null ? [] : [baseline]), ...thresholdList]
    .filter((v) => Number.isFinite(v));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (max - min < 0.0001) {
    max += 1;
    min -= 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const yFor = (v: number) => BOTTOM - ((v - min) / (max - min)) * (BOTTOM - TOP);
  const xFor = (ms: number) => LEFT + ((ms - minMs) / spanMs) * (RIGHT - LEFT);

  const startMs = start ? timeMs(start) : NaN;
  const endMs = end ? timeMs(end) : NaN;
  const windowStart = Number.isFinite(startMs) ? xFor(Math.max(minMs, Math.min(maxMs, startMs))) : LEFT;
  const windowEnd = Number.isFinite(endMs) ? xFor(Math.max(minMs, Math.min(maxMs, endMs))) : RIGHT;

  const peak = (() => {
    const inWindow = points.filter(
      (p) => (!Number.isFinite(startMs) || p.ms >= startMs) && (!Number.isFinite(endMs) || p.ms <= endMs),
    );
    const pool = inWindow.length ? inWindow : points;
    return pool.reduce((best, p) => (p.value > best.value ? p : best), pool[0]);
  })();
  const peakX = xFor(peak.ms);
  const peakY = yFor(peak.value);

  const polyline = points.map((p) => `${xFor(p.ms).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(' ');

  return (
    <View style={{ marginVertical: 6 }}>
      <Svg width={W} height={H}>
        {/* 网格 */}
        {[0, 1, 2, 3].map((i) => {
          const y = TOP + ((BOTTOM - TOP) / 3) * i;
          return <Line key={i} x1={LEFT} y1={y} x2={RIGHT} y2={y} stroke="#dbe6e9" strokeWidth={0.5} />;
        })}

        {/* 异常区间 */}
        {windowEnd > windowStart && (
          <Rect
            x={windowStart}
            y={TOP}
            width={windowEnd - windowStart}
            height={BOTTOM - TOP}
            fill="#0c8f80"
            opacity={0.06}
          />
        )}

        {/* 基线 / 阈值 */}
        {baseline !== null && (
          <Line
            x1={LEFT}
            y1={yFor(baseline)}
            x2={RIGHT}
            y2={yFor(baseline)}
            stroke="#6f9fc9"
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
        )}
        {thresholdList.map((value, index) => (
          <Line
            key={`th-${index}`}
            x1={LEFT}
            y1={yFor(value)}
            x2={RIGHT}
            y2={yFor(value)}
            stroke="#c99d58"
            strokeWidth={0.8}
            strokeDasharray="3 2"
          />
        ))}

        {/* 实测折线 */}
        <Polyline points={polyline} fill="none" stroke="#0c8f80" strokeWidth={1.6} strokeLinejoin="round" />
        <Circle cx={peakX} cy={peakY} r={2.6} fill="#c0392b" />
        <Text
          x={Math.min(RIGHT - 70, Math.max(LEFT + 2, peakX + 4))}
          y={Math.max(TOP + 8, peakY - 5)}
          style={{ fontSize: 7, fill: '#c0392b', fontFamily: 'CN' }}
        >
          峰值 {num(peak.value)} {unit}
        </Text>

        {/* 坐标标注 */}
        <Text x={4} y={TOP + 3} style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>{num(max)}</Text>
        <Text x={4} y={BOTTOM + 2} style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>{num(min)}</Text>
        <Text x={LEFT} y={BOTTOM + 14} style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>{shortTime(points[0].at)}</Text>
        <Text x={RIGHT} y={BOTTOM + 14} textAnchor="end" style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>
          {shortTime(points[points.length - 1].at)}
        </Text>

        {/* 图例 */}
        <Line x1={LEFT} y1={H - 18} x2={LEFT + 14} y2={H - 18} stroke="#0c8f80" strokeWidth={1.6} />
        <Text x={LEFT + 18} y={H - 15} style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>实测值</Text>
        <Line x1={LEFT + 60} y1={H - 18} x2={LEFT + 74} y2={H - 18} stroke="#6f9fc9" strokeWidth={0.8} strokeDasharray="2 2" />
        <Text x={LEFT + 78} y={H - 15} style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>基线</Text>
        {thresholdList.length > 0 && (
          <>
            <Line x1={LEFT + 112} y1={H - 18} x2={LEFT + 126} y2={H - 18} stroke="#c99d58" strokeWidth={0.8} strokeDasharray="3 2" />
            <Text x={LEFT + 130} y={H - 15} style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>阈值</Text>
          </>
        )}
        <Text x={RIGHT - 80} y={H - 15} style={{ fontSize: 7, fill: '#5d7580', fontFamily: 'CN' }}>
          {metricLabel} · 单位 {unit || '—'}
        </Text>
      </Svg>
      <Text style={{ fontSize: 7, color: '#5d7580', marginTop: 2, textAlign: 'center' }}>
        图 3-1　触发指标处置前后实测趋势（异常区间阴影，基线/阈值来自恢复评估窗口）
      </Text>
    </View>
  );
}
