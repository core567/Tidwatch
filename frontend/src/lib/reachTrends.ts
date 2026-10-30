import type { Observation } from '@/types/contract';

/**
 * 多断面趋势对比的数据转换（纯函数，不做任何插值/平滑/补零）。
 * 真实性原则：
 * - 时间轴用真实 observedAt；缺测区间通过 null 分段让折线断开，不连线；
 * - 不删除/平滑异常值（S2/S3 注入的 9m 洪峰必须保留）；
 * - 去重仅处理“同一毫秒完全重复”的记录，不影响正常的每分钟序列。
 */

export interface ReachTrendInput {
  reachId: string;
  name: string;
  color: string;
  rows: Observation[];
}

export interface ChartPoint {
  /** epoch ms */
  t: number;
  value: number | null;
  /** 该点来源的原始观测（null 点为缺测占位，无原始记录） */
  obs: Observation | null;
  reachId: string;
  reachName: string;
}

export interface ReachCoverage {
  reachId: string;
  reachName: string;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  /** 去重丢弃的条数 */
  duplicated: number;
}

export interface ReachStats {
  reachId: string;
  reachName: string;
  count: number;
  min: number | null;
  max: number | null;
  /** 超过任一阈值的真实点数 */
  outlierCount: number;
  /** 缺测/非 GOOD 质量点数 */
  nonGoodCount: number;
  coveragePct: number;
  gaps: { from: number; to: number; minutes: number }[];
}

export interface TrendBuildResult {
  /** 每个断面一条折线（已用 null 分段，缺测断开） */
  lines: {
    reachId: string;
    reachName: string;
    color: string;
    points: ChartPoint[];
  }[];
  /** 独立的越限异常点（用于散点标记；与折线不重复进 tooltip） */
  outliers: { t: number; value: number; reachId: string; reachName: string; obs: Observation }[];
  coverage: ReachCoverage[];
  stats: ReachStats[];
  /** 全部断面的实际时间跨度 */
  spanMs: number;
  spanStart: number | null;
  spanEnd: number | null;
  /**
   * 图表 X 轴范围：
   * - full：用户选择的完整查询窗口（保留右侧长缺测，不补点）
   * - focus：聚焦有效数据（实际首末观测 + 适度留白），曲线易读
   */
  xRangeFull: { min: number; max: number } | null;
  xRangeFocus: { min: number; max: number } | null;
  queryStart: number | null;
  queryEnd: number | null;
}

export interface BuildOptions {
  /** 用户选择窗口的起点（完整模式 X 轴起点） */
  queryStart?: number | null;
  /** 用户选择窗口的终点（默认当前时间） */
  queryEnd?: number | null;
  /** 聚焦模式两端留白比例（相对实际跨度），默认 4% */
  focusPadRatio?: number;
}


/** 同毫秒 + 同值视为重复（防御性，当前数据实测无重复） */
function dedupe(rows: Observation[]): { clean: Observation[]; duplicated: number } {
  const seen = new Set<string>();
  const clean: Observation[] = [];
  let duplicated = 0;
  for (const r of rows) {
    const key = `${new Date(r.observedAt).getTime()}|${r.value}`;
    if (seen.has(key)) {
      duplicated += 1;
      continue;
    }
    seen.add(key);
    clean.push(r);
  }
  return { clean, duplicated };
}

/**
 * 构建图表数据。
 * @param gapMs 相邻点超过该间隔则在中间插入 null 分段，折线断开
 * @param metricThresholds 当前指标的越限阈值（所有断面共用，来自 demo-rules-v1）
 */
export function buildReachTrends(
  inputs: ReachTrendInput[],
  gapMs: number,
  metricThresholds: number[],
  options: BuildOptions = {},
): TrendBuildResult {
  const lines: TrendBuildResult['lines'] = [];
  const outliers: TrendBuildResult['outliers'] = [];
  const coverage: ReachCoverage[] = [];
  const stats: ReachStats[] = [];

  let spanStart: number | null = null;
  let spanEnd: number | null = null;

  for (const input of inputs) {
    const { clean, duplicated } = dedupe(input.rows);
    const sorted = [...clean].sort(
      (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
    );

    const points: ChartPoint[] = [];
    const gaps: ReachStats['gaps'] = [];
    let prev: ChartPoint | null = null;
    let min: number | null = null;
    let max: number | null = null;
    let outlierCount = 0;
    let nonGoodCount = 0;

    for (const obs of sorted) {
      const t = new Date(obs.observedAt).getTime();
      if (prev && t - prev.t > gapMs) {
        // 缺测：用 [prevT, null] 占位触发断线，不补任何值
        points.push({ t: prev.t, value: null, obs: null, reachId: input.reachId, reachName: input.name });
        points.push({ t, value: null, obs: null, reachId: input.reachId, reachName: input.name });
        gaps.push({ from: prev.t, to: t, minutes: (t - prev.t) / 60000 });
      }
      points.push({ t, value: obs.value, obs, reachId: input.reachId, reachName: input.name });
      if (min === null || obs.value < min) min = obs.value;
      if (max === null || obs.value > max) max = obs.value;
      if (metricThresholds.some((l) => obs.value > l)) {
        outlierCount += 1;
        outliers.push({ t, value: obs.value, reachId: input.reachId, reachName: input.name, obs });
      }
      if (obs.qualityFlag !== 'GOOD') nonGoodCount += 1;
      prev = points[points.length - 1];
      if (spanStart === null || t < spanStart) spanStart = t;
      if (spanEnd === null || t > spanEnd) spanEnd = t;
    }

    lines.push({ reachId: input.reachId, reachName: input.name, color: input.color, points });
    coverage.push({
      reachId: input.reachId,
      reachName: input.name,
      count: sorted.length,
      firstAt: sorted[0]?.observedAt ?? null,
      lastAt: sorted[sorted.length - 1]?.observedAt ?? null,
      duplicated,
    });

    const span = sorted.length >= 2
      ? new Date(sorted[sorted.length - 1].observedAt).getTime() - new Date(sorted[0].observedAt).getTime()
      : 0;
    // 覆盖率 = 有效点间隔占“点跨度”的比例；缺测缺口越长覆盖率越低
    const gapTotal = gaps.reduce((sum, g) => sum + (g.to - g.from), 0);
    const coveragePct = span > 0 ? Math.max(0, Math.min(100, ((span - gapTotal) / span) * 100)) : (sorted.length > 0 ? 100 : 0);

    stats.push({
      reachId: input.reachId,
      reachName: input.name,
      count: sorted.length,
      min,
      max,
      outlierCount,
      nonGoodCount,
      coveragePct: Math.round(coveragePct),
      gaps,
    });
  }

  // X 轴范围
  const queryEnd = options.queryEnd ?? Date.now();
  const queryStart = options.queryStart ?? null;
  const padRatio = options.focusPadRatio ?? 0.04;

  // 完整范围：用户查询起点 ~ 查询终点（now）。无显式起点时退回数据起点。
  const fullMin = queryStart ?? spanStart;
  const fullMax = queryEnd;
  const xRangeFull = fullMin !== null && spanStart !== null ? { min: fullMin, max: fullMax } : null;

  // 聚焦范围：实际首末观测 + 两端留白；单点时给一个对称小窗口
  let xRangeFocus: { min: number; max: number } | null = null;
  if (spanStart !== null && spanEnd !== null) {
    const dataSpan = Math.max(spanEnd - spanStart, 1);
    const pad = dataSpan * padRatio;
    xRangeFocus = { min: spanStart - pad, max: spanEnd + pad };
  }

  return {
    lines,
    outliers,
    coverage,
    stats,
    spanMs: spanStart !== null && spanEnd !== null ? spanEnd - spanStart : 0,
    spanStart,
    spanEnd,
    xRangeFull,
    xRangeFocus,
    queryStart,
    queryEnd,
  };
}
