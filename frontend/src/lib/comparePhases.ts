import type { Observation } from '@/types/contract';

export type ComparePhase = 'BASELINE' | 'ANOMALY' | 'POST';

export interface PhaseStat {
  start: string | null;
  end: string | null;
  count: number;
  median: number | null;
}

export function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 按首现时间与处置锚点把 GOOD 观测切为三段并统计。无锚点则不产生 POST。 */
export function splitPhases(
  rows: Observation[],
  firstMs: number | null,
  anchorMs: number | null,
): Record<ComparePhase, PhaseStat> {
  const buckets: Record<ComparePhase, Observation[]> = {
    BASELINE: [],
    ANOMALY: [],
    POST: [],
  };
  if (firstMs != null) {
    for (const r of rows) {
      if (r.qualityFlag !== 'GOOD') continue;
      const t = Date.parse(r.observedAt);
      const phase: ComparePhase =
        t < firstMs ? 'BASELINE' : anchorMs != null && t >= anchorMs ? 'POST' : 'ANOMALY';
      buckets[phase].push(r);
    }
  }
  const stat = (arr: Observation[]): PhaseStat => ({
    start: arr[0]?.observedAt ?? null,
    end: arr[arr.length - 1]?.observedAt ?? null,
    count: arr.length,
    median: medianOf(arr.map((x) => x.value)),
  });
  return { BASELINE: stat(buckets.BASELINE), ANOMALY: stat(buckets.ANOMALY), POST: stat(buckets.POST) };
}

/** 三段观察范围（ISO），用于一次性拉取覆盖三段的观测。 */
export function compareRange(firstMs: number | null, anchorMs: number | null, windowMin = 60) {
  if (firstMs == null) return null;
  return {
    start: new Date(firstMs - windowMin * 60000).toISOString(),
    end: new Date((anchorMs ?? firstMs + 6 * 3600 * 60000) + windowMin * 60000).toISOString(),
  };
}
