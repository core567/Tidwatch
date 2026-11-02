import { useId, type CSSProperties } from 'react';

type Tone = 'good' | 'watch' | 'alert' | 'neutral';

const tones: Record<Tone, { stroke: string; area: string }> = {
  good: { stroke: 'var(--good)', area: 'rgba(95, 227, 160, 0.16)' },
  watch: { stroke: 'var(--warn)', area: 'rgba(255, 196, 107, 0.16)' },
  alert: { stroke: 'var(--danger)', area: 'rgba(255, 111, 94, 0.16)' },
  neutral: { stroke: 'var(--tide)', area: 'rgba(79, 230, 210, 0.16)' },
};

function buildPath(points: [number, number][], smooth = true) {
  if (points.length < 2) return '';
  if (!smooth) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  tone?: Tone;
  fill?: boolean;
  showEnd?: boolean;
  threshold?: number;
  animate?: boolean;
}

export function Sparkline({
  values,
  width = 118,
  height = 30,
  tone = 'neutral',
  fill = true,
  showEnd = true,
  threshold,
  animate = false,
}: SparklineProps) {
  const rawId = useId();
  const gradId = `spark-${rawId.replace(/[^a-zA-Z0-9-]/g, '')}`;
  if (values.length === 0) {
    // 精致空态占位：装饰性淡虚线 + 端点，明显区别于真实数据曲线，不伪造序列。
    const midY = height / 2;
    return (
      <svg
        className="v2-spark v2-spark--empty"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="暂无历史序列"
      >
        <line
          x1={4}
          x2={width - 4}
          y1={midY - 3}
          y2={midY - 3}
          stroke="rgba(120,205,210,0.16)"
          strokeDasharray="1.5 5"
        />
        <line
          x1={4}
          x2={width - 4}
          y1={midY + 3}
          y2={midY + 3}
          stroke="rgba(120,205,210,0.16)"
          strokeDasharray="1.5 5"
        />
        <circle cx={width - 5} cy={midY} r={1.6} fill="rgba(120,205,210,0.3)" />
        <circle cx={5} cy={midY} r={1.6} fill="rgba(120,205,210,0.3)" />
      </svg>
    );
  }
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points: [number, number][] = values.map((v, i) => [
    pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1),
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);

  const line = buildPath(points);
  const area = `${line} L${points[points.length - 1][0]},${height} L${points[0][0]},${height} Z`;
  const palette = tones[tone];
  const thresholdY =
    threshold !== undefined && threshold >= min && threshold <= max
      ? pad + (1 - (threshold - min) / span) * (height - pad * 2)
      : null;

  return (
    <svg
      className={`v2-spark ${animate ? 'v2-spark--animate' : ''}`.trim()}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.area} />
          <stop offset="100%" stopColor={palette.area} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path className="v2-spark__area-fill" d={area} fill={`url(#${gradId})`} />}
      {thresholdY !== null && (
        <line
          className="v2-spark__threshold"
          x1={pad}
          x2={width - pad}
          y1={thresholdY}
          y2={thresholdY}
        />
      )}
      <path
        className="v2-spark__line"
        d={line}
        pathLength={animate ? 1 : undefined}
        style={
          {
            stroke: palette.stroke,
            '--spark-glow': palette.area,
          } as CSSProperties
        }
        strokeWidth="1.5"
      />
      {showEnd && (
        <circle
          className="v2-spark__dot"
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r="2.2"
          style={{ fill: palette.stroke }}
        />
      )}
    </svg>
  );
}
