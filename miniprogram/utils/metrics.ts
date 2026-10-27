// utils/metrics.ts - 指标中文名/单位/来源口径（移植自 PC frontend/src/lib/metrics.ts，与 PC 保持一致）

/** MQTT 模拟链路三项连续指标 */
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

/** flowLevel 后端 unit 为 enum0-3，展示统一用「级」 */
export function simMetricUnit(unit: string, key: string): string {
  return key === 'flowLevel' ? SIM_METRIC_UNIT.flowLevel : unit;
}

export function simMetricUnitByKey(key: string): string {
  return SIM_METRIC_UNIT[key] ?? '';
}

/** 官方自动站 9 项核心指标（与 PC OFFICIAL_METRICS 对齐） */
export interface OfficialMetricDef {
  key: string;
  label: string;
  unit: string;
  digits: number;
  hint?: string;
}

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

export function waterClassTone(cls: string | null | undefined): 'ok' | 'watch' | 'danger' | 'off' {
  if (!cls) return 'off';
  if (cls === 'Ⅰ' || cls === 'Ⅱ') return 'ok';
  if (cls === 'Ⅲ') return 'watch';
  return 'danger';
}

/** 从官方快照记录取数值并按位数格式化（null 安全） */
export function formatOfficialValue(
  record: OfficialAutoRecord | null | undefined,
  def: OfficialMetricDef,
): string {
  if (!record) return '—';
  const v = (record as unknown as Record<string, unknown>)[def.key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${v.toFixed(def.digits)}${def.unit ? ' ' + def.unit : ''}`;
}
