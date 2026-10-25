import type { OfficialAutoRecord } from '@/types/contract';

export interface OfficialMetricDef {
  key: keyof OfficialAutoRecord;
  label: string;
  unit: string;
  digits: number;
  /** 教学性参考区间（非 GB3838 判定） */
  hint?: string;
}

/** 官方自动站实际发布的 9 项核心水质指标（湖库另含叶绿素a/藻密度）。 */
export const OFFICIAL_METRICS: OfficialMetricDef[] = [
  { key: 'dissolvedOxygen', label: '溶解氧', unit: 'mg/L', digits: 2, hint: '地表水 ≥5 较好（教学参考）' },
  { key: 'ph', label: 'pH', unit: '', digits: 2, hint: '6–9 为一般适宜范围' },
  { key: 'ammoniaN', label: '氨氮', unit: 'mg/L', digits: 3, hint: 'Ⅲ类 ≤1.0（教学参考）' },
  { key: 'codMn', label: '高锰酸盐指数', unit: 'mg/L', digits: 2, hint: 'Ⅲ类 ≤6（教学参考）' },
  { key: 'totalPhosphorus', label: '总磷', unit: 'mg/L', digits: 3, hint: 'Ⅲ类 ≤0.2（河流）' },
  { key: 'totalNitrogen', label: '总氮', unit: 'mg/L', digits: 2, hint: 'Ⅲ类 ≤1.0（湖库口径）' },
  { key: 'turbidity', label: '浊度', unit: 'NTU', digits: 1, hint: '非国标评价指标' },
  { key: 'waterTemp', label: '水温', unit: '℃', digits: 1, hint: '物理指标' },
  { key: 'conductivity', label: '电导率', unit: 'μS/cm', digits: 1, hint: '物理指标' },
];

export const OFFICIAL_EXTRA_METRICS: OfficialMetricDef[] = [
  { key: 'chlorophyllA', label: '叶绿素a', unit: 'μg/L', digits: 2, hint: '仅湖库站发布' },
  { key: 'algaeDensity', label: '藻密度', unit: 'cells/L', digits: 0, hint: '仅湖库站发布' },
];

export function waterClassTone(cls: string | null | undefined): 'ok' | 'watch' | 'danger' | 'muted' {
  if (!cls) return 'muted';
  if (cls === 'Ⅰ' || cls === 'Ⅱ') return 'ok';
  if (cls === 'Ⅲ') return 'watch';
  return 'danger';
}

export const SIM_METRIC_LABEL: Record<string, string> = {
  waterLevel: '水位',
  turbidity: '浊度',
  flowLevel: '水流等级',
};

export const SIM_METRIC_UNIT: Record<string, string> = {
  waterLevel: 'm',
  turbidity: 'NTU',
  flowLevel: '级',
};

export function simMetricName(key: string): string {
  return SIM_METRIC_LABEL[key] ?? key;
}

export function simMetricUnit(unit: string, key: string): string {
  return key === 'flowLevel' ? SIM_METRIC_UNIT.flowLevel : unit;
}

/** 仅按指标 key 取展示单位（事件触发指标等无原始 unit 的场景）。 */
export function simMetricUnitByKey(key: string): string {
  return SIM_METRIC_UNIT[key] ?? '';
}

export function formatOfficialValue(
  record: OfficialAutoRecord | null | undefined,
  def: OfficialMetricDef,
): number | null {
  if (!record) return null;
  const v = record[def.key];
  return typeof v === 'number' ? v : null;
}
