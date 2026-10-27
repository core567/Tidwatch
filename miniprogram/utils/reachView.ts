// 断面列表数据组装（纯函数，可单测）：最新指标数组 -> 三指标速览
import { simMetricName, simMetricUnit } from './metrics';

export interface LatestMetricView {
  key: string;
  label: string;
  value: string;
  unit: string;
}

/** 指标展示格式化：水位/浊度保留 2 位小数，水流等级为整数 */
export function formatMetricValue(key: string, value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (key === 'flowLevel') return String(value);
  return value.toFixed(2);
}

// 断面逻辑点名（与 PC/后端拓扑一致：a 上游、b 中游、c 下游）
const REACH_NAMES: Record<string, string> = {
  'reach-a': '上游 A',
  'reach-b': '中游 B',
  'reach-c': '下游 C',
};

/** reach-a/b/c → 上游 A/中游 B/下游 C；未知 id 原样返回 */
export function reachDisplayName(id: string): string {
  return REACH_NAMES[id] ?? id;
}

/** 一组断面 id 转中文名（用于事件影响范围） */
export function reachDisplayNames(ids: string[] | undefined | null): string[] {
  return (ids ?? []).map(reachDisplayName);
}

/** 从 /reaches/{id}/latest 取水位/浊度/水流三项速览（缺失项为 null） */
export function latestMetricViews(
  rows: Array<{ metric: string; value: number; unit: string }> | undefined | null,
): LatestMetricView[] {
  const byKey = new Map((rows ?? []).map((r) => [r.metric, r]));
  return (['waterLevel', 'turbidity', 'flowLevel'] as const).map((key) => {
    const row = byKey.get(key);
    return {
      key,
      label: simMetricName(key),
      value: row ? formatMetricValue(key, row.value) : '—',
      unit: row ? simMetricUnit(row.unit, key) : simMetricUnit('', key),
    };
  });
}
