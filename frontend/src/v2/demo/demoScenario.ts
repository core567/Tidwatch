/**
 * 场景演示剧本引擎（前端内存回放，严格不落库、不调用任何写 API）。
 *
 * - 确定性生成：固定种子 LCG，不使用 Math.random —— 每次重播序列完全一致。
 * - 时间轴与真实系统时钟完全独立：演示时间从 00:00 开始，步长 10 分钟 × 144 点 = 24 小时。
 * - 四阶段：00:00–06:00 正常基线 → 06:00–14:00 异常发展（B 站浊度/水位抬升、DO 下降）
 *   → 14:00–18:00 风险预警（浊度破 60 NTU 阈值）→ 18:00–24:00 恢复回落。
 */

export type DemoMetricKey = 'level' | 'turbidity' | 'ph' | 'oxygen' | 'ammonia';
export type DemoReachId = 'reach-a' | 'reach-b' | 'reach-c';

export const DEMO_TICK_MINUTES = 10;
export const DEMO_TICK_COUNT = 144; // 24h
export const DEMO_TURBIDITY_THRESHOLD = 60;

export interface DemoPhase {
  key: 'baseline' | 'developing' | 'alert' | 'recovery';
  label: string;
  fromTick: number;
  toTick: number;
}

export const DEMO_PHASES: DemoPhase[] = [
  { key: 'baseline', label: '正常基线', fromTick: 0, toTick: 36 },
  { key: 'developing', label: '异常发展', fromTick: 36, toTick: 84 },
  { key: 'alert', label: '风险预警', fromTick: 84, toTick: 108 },
  { key: 'recovery', label: '恢复回落', fromTick: 108, toTick: 144 },
];

export interface DemoTick {
  t: number; // 演示分钟（0-1430）
  label: string; // 演示时间 HH:mm
  perReach: Record<DemoReachId, Record<DemoMetricKey, number>>;
}

interface Baseline {
  level: number; turbidity: number; ph: number; oxygen: number; ammonia: number;
  noise: { level: number; turbidity: number; ph: number; oxygen: number; ammonia: number };
}

const BASELINES: Record<DemoReachId, Baseline> = {
  'reach-a': { level: 4.5, turbidity: 20, ph: 7.6, oxygen: 6.8, ammonia: 0.05, noise: { level: 0.05, turbidity: 1.4, ph: 0.05, oxygen: 0.15, ammonia: 0.01 } },
  'reach-b': { level: 4.3, turbidity: 22, ph: 7.4, oxygen: 6.4, ammonia: 0.06, noise: { level: 0.05, turbidity: 1.6, ph: 0.05, oxygen: 0.15, ammonia: 0.01 } },
  'reach-c': { level: 4.1, turbidity: 18, ph: 7.8, oxygen: 7.0, ammonia: 0.04, noise: { level: 0.05, turbidity: 1.2, ph: 0.05, oxygen: 0.15, ammonia: 0.01 } },
};

/** 固定种子 LCG（0-1 均匀伪随机，序列完全确定） */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** B 站异常强度：按阶段包络（0 基线 → 1 峰值 → 0 恢复），A/C 站轻度跟随 */
function anomalyEnvelope(tick: number, reach: DemoReachId): number {
  const dev = smooth(clamp((tick - 36) / 48, 0, 1)); // 36→84 发展
  const peak = clamp(1 - Math.abs(tick - 96) / 12, 0, 1); // 84→108 预警峰值
  const rec = 1 - smooth(clamp((tick - 108) / 36, 0, 1)); // 108→144 恢复
  const envelope = Math.max(dev, peak) * rec;
  if (reach === 'reach-b') return envelope;
  return envelope * 0.25; // 上下游轻度响应
}

function metricAt(b: Baseline, rnd: () => number, tick: number, reach: DemoReachId): Record<DemoMetricKey, number> {
  const e = anomalyEnvelope(tick, reach);
  const noise = (key: keyof Baseline['noise']) => (rnd() * 2 - 1) * b.noise[key];
  return {
    level: clamp(b.level + noise('level') + e * 1.6, 3.0, 8.0),
    turbidity: clamp(b.turbidity + noise('turbidity') + e * 62, 5, 95),
    ph: clamp(b.ph + noise('ph') - e * 0.9, 5.5, 9.5),
    oxygen: clamp(b.oxygen + noise('oxygen') - e * 2.6, 1.5, 12),
    ammonia: clamp(b.ammonia + noise('ammonia') + e * 0.45, 0, 1.2),
  };
}

function tickLabel(tick: number): string {
  const mins = tick * DEMO_TICK_MINUTES;
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function phaseOf(tick: number): DemoPhase {
  return DEMO_PHASES.find((p) => tick >= p.fromTick && tick < p.toTick) ?? DEMO_PHASES[DEMO_PHASES.length - 1];
}

/** 生成完整剧本（确定性；同一函数每次调用输出完全一致） */
export function buildDemoScenario(): DemoTick[] {
  const reachIds: DemoReachId[] = ['reach-a', 'reach-b', 'reach-c'];
  const rngs = Object.fromEntries(reachIds.map((r) => [r, lcg(271026 + r.charCodeAt(r.length - 1))])) as Record<DemoReachId, () => number>;
  return Array.from({ length: DEMO_TICK_COUNT }, (_, tick) => ({
    t: tick * DEMO_TICK_MINUTES,
    label: tickLabel(tick),
    perReach: Object.fromEntries(
      reachIds.map((r) => [r, metricAt(BASELINES[r], rngs[r], tick, r)]),
    ) as DemoTick['perReach'],
  }));
}

export interface DemoEventSpec {
  id: string;
  title: string;
  reachId: DemoReachId;
  fromTick: number;
  toTick: number;
  risk: 'high';
}

/** 演示内存事件（id 固定 DEMO- 前缀，绝不与后端事件混淆） */
export const DEMO_EVENTS: DemoEventSpec[] = [
  { id: 'DEMO-001', title: '场景演示：中游 B 浊度持续抬升', reachId: 'reach-b', fromTick: 84, toTick: 114, risk: 'high' },
];
