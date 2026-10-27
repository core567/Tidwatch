// 趋势图数据处理纯函数（可单测）
// 设计原则：
// - X 坐标永远基于真实时间戳（毫秒），绝不使用数组下标，避免稀疏/跨段数据挤到一侧；
// - 观测时间不连续时断线，绝不跨缺测区间连线或插值；
// - 所有格式化（刻度/时间）在此处纯函数完成，组件只负责绘制。

export interface SparkPoint {
  /** ISO 观测时间 */
  t: string;
  v: number;
  sourceType?: string;
  scenarioId?: string | null;
}

export interface Segment {
  /** 在【已排序、已去重】点序列中的下标区间（含端点） */
  start: number;
  end: number;
}

/** 去重：同一毫秒时间戳只保留一条（后者覆盖），并丢弃非法数值，按时间升序 */
export function normalizePoints(points: SparkPoint[]): SparkPoint[] {
  const byTs = new Map<number, SparkPoint>();
  for (const p of points) {
    const ts = new Date(p.t).getTime();
    if (Number.isNaN(ts) || typeof p.v !== 'number' || !Number.isFinite(p.v)) continue;
    byTs.set(ts, p);
  }
  return [...byTs.values()].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
}

/**
 * 缺测分段：相邻点间隔超过阈值即断开。
 * 阈值 = max(相邻间隔中位数 × gapFactor, minGapMs)，双重条件避免
 * 「突发高频段把中位数压低导致正常 1 分钟间隔被误断」。
 */
export function buildSegments(
  points: SparkPoint[],
  opts: { gapFactor?: number; minGapMs?: number } = {},
): Segment[] {
  const pts = normalizePoints(points);
  const { gapFactor = 3, minGapMs = 5 * 60 * 1000 } = opts;
  if (pts.length === 0) return [];
  if (pts.length === 1) return [{ start: 0, end: 0 }];

  const gaps = pts.slice(1).map((p, i) => new Date(p.t).getTime() - new Date(pts[i].t).getTime());
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const threshold = Math.max(median * gapFactor, minGapMs);

  const segs: Segment[] = [];
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (gaps[i - 1] > threshold) {
      segs.push({ start, end: i - 1 });
      start = i;
    }
  }
  segs.push({ start, end: pts.length - 1 });
  return segs;
}

export function sortPoints(points: SparkPoint[]): SparkPoint[] {
  return normalizePoints(points);
}

export interface ValueRange {
  min: number;
  max: number;
}

/** Y 轴值域：min/max 加比例 padding；恒定值以 1 为半宽 */
export function valueRange(points: SparkPoint[], padRatio = 0.12): ValueRange {
  const pts = normalizePoints(points);
  if (pts.length === 0) return { min: 0, max: 1 };
  const values = pts.map((p) => p.v);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * padRatio;
  return { min: min - pad, max: max + pad };
}

/** Y 轴刻度（等分 count 段），数值格式随量级自适应 */
export function yTicks(range: ValueRange, count = 4): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let i = 0; i <= count; i++) {
    const value = range.min + ((range.max - range.min) * i) / count;
    out.push({ value, label: formatValueTick(value, range.max - range.min) });
  }
  return out;
}

function formatValueTick(v: number, span: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (span >= 10) return v.toFixed(1);
  if (span >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

/** X 轴时间刻度（含起止），跨度不同使用不同格式 */
export function xTicks(t0: number, t1: number, count = 4): { ts: number; label: string }[] {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return [];
  const span = t1 - t0;
  const sameDay = new Date(t0).toDateString() === new Date(t1).toDateString();
  const out: { ts: number; label: string }[] = [];
  for (let i = 0; i <= count; i++) {
    const ts = t0 + (span * i) / count;
    out.push({ ts, label: formatTime(ts, { sameDay, span }) });
  }
  return out;
}

export interface TimeFmtOpts {
  sameDay?: boolean;
  span?: number;
}

export function formatTime(ts: number, opts: TimeFmtOpts = {}): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}`;
  const min = `${hm}:${String(d.getMinutes()).padStart(2, '0')}`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (opts.span !== undefined && opts.span > 24 * 3600 * 1000) return `${md} ${min}`;
  if (opts.sameDay) return min;
  return `${md} ${min}`;
}

/** 气泡内完整时间 */
export function formatFullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0',
  )}`;
}

/**
 * 时间窗口过滤：以「参考时间」（通常为数据最新观测时间）回溯 windowMs。
 * 数据链路中断时也以最后有效观测为锚点，保证历史曲线可见。
 */
export function filterByWindow(points: SparkPoint[], windowMs: number, anchorTs?: number): SparkPoint[] {
  const pts = normalizePoints(points);
  if (pts.length === 0) return [];
  const anchor = anchorTs ?? new Date(pts[pts.length - 1].t).getTime();
  const from = anchor - windowMs;
  return pts.filter((p) => new Date(p.t).getTime() >= from && new Date(p.t).getTime() <= anchor);
}

export const HOUR_MS = 3600 * 1000;
