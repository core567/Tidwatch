// 人工复测测量项规则（纯前端，可单测）
//
// 重要边界：
// - 后端任务没有结构化“必填测量项”字段，只有 actionType 与 reason 文本。
//   因此这里的规则是“按任务类型给出的建议测量项”，UI 必须如实标注为建议，
//   不得伪装成任务的硬性要求或后端规则。
// - 建议项的提交完整性：有值 或 选择未测原因，二选一；非建议项完全选填。
// - 数值校验只做“格式”（数字/非负/枚举），不做无依据的业务合法范围；
//   flowLevel 的 0–3 来自后端字段本身的枚举定义（unit=enum0-3），属于格式而非业务判定。
// - 未测原因与数值一起写入 measurements（free-form JSON，后端原样存取），
//   不新增后端字段。

export type ManualMetricKey = 'waterLevel' | 'turbidity' | 'flowLevel';
export type MeasureInput = 'decimal' | 'level';

export interface ManualMetricDef {
  key: ManualMetricKey;
  label: string;
  unit: string;
  input: MeasureInput;
  hint: string;
}

export const MANUAL_METRICS: ManualMetricDef[] = [
  { key: 'waterLevel', label: '水位', unit: 'm', input: 'decimal', hint: '水尺读数 · 数值 ≥ 0' },
  { key: 'turbidity', label: '浊度', unit: 'NTU', input: 'decimal', hint: '便携浊度仪 · 数值 ≥ 0' },
  { key: 'flowLevel', label: '水流等级', unit: '级', input: 'level', hint: '目视 0–3 级整数（枚举）' },
];

export const UNMEASURED_REASONS = [
  '安全无法靠近',
  '设备故障/未携带',
  '点位被淹没',
  '天气/能见度',
  '其他',
] as const;

/** actionType → 建议测量项（无复测意义的任务返回空数组） */
export function suggestedMetrics(actionType: string): ManualMetricKey[] {
  switch (actionType) {
    case 'MANUAL_CHECK':
      return ['waterLevel', 'turbidity', 'flowLevel'];
    case 'CONTINUE_OBSERVE':
    case 'FOCUS_REACH_B':
    case 'FOCUS_REACH_C':
    case 'KEEP_LOCAL_SCOPE':
    case 'RE_EVALUATE_AFTER_RECOVERY':
      return ['waterLevel', 'turbidity'];
    case 'INSPECT_DATA_LINK':
      return [];
    default:
      return [];
  }
}

export function metricDef(key: ManualMetricKey): ManualMetricDef {
  return MANUAL_METRICS.find((m) => m.key === key)!;
}

/** 单个字段的格式校验结果（与业务范围分离） */
export type MetricFormat =
  | { ok: true }
  | { ok: false; error: string };

export function validateMetricFormat(key: ManualMetricKey, raw: string): MetricFormat {
  if (raw.trim() === '') return { ok: true }; // 空值交由“完整性”规则处理
  const v = Number(raw);
  if (!Number.isFinite(v)) return { ok: false, error: '请输入数字' };
  if (v < 0) return { ok: false, error: '数值不能为负' };
  if (key === 'flowLevel') {
    if (!Number.isInteger(v)) return { ok: false, error: '水流等级为 0–3 的整数' };
    if (v < 0 || v > 3) return { ok: false, error: '水流等级为 0–3 级' };
  }
  return { ok: true };
}

/** 一行测量的当前状态 */
export interface MeasureState {
  key: ManualMetricKey;
  raw: string;
  reason: string;
}

export function isMeasured(s: MeasureState): boolean {
  return s.raw.trim() !== '';
}

/**
 * 提交完整性：
 * - 建议项：必须有值或有未测原因；
 * - 任何有值的项必须先通过格式校验；
*  - 不允许“有原因又有值”（语义冲突）。
 */
export function checkMeasurements(
  states: MeasureState[],
  suggested: ManualMetricKey[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const s of states) {
    const def = metricDef(s.key);
    const hasValue = s.raw.trim() !== '';
    const hasReason = s.reason !== '';
    const isSuggested = suggested.includes(s.key);

    if (hasValue && hasReason) {
      errors.push(`「${def.label}」不能同时填写数值与未测原因`);
      continue;
    }
    if (hasValue) {
      const f = validateMetricFormat(s.key, s.raw);
      if (!f.ok) errors.push(`「${def.label}」${f.error}`);
    } else if (isSuggested && !hasReason) {
      errors.push(`「${def.label}」为建议测量项：请填写数值或选择未测原因`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 生成提交用 measurements（free-form dict[]，后端原样存取） */
export interface MeasurementPayload {
  metric: string;
  value: number | null;
  unit: string;
  sourceType: 'MANUAL';
  unmeasuredReason?: string;
}

export function buildMeasurementsPayload(states: MeasureState[]): MeasurementPayload[] {
  const out: MeasurementPayload[] = [];
  for (const s of states) {
    const def = metricDef(s.key);
    if (s.raw.trim() !== '') {
      out.push({
        metric: s.key,
        value: Number(s.raw),
        unit: def.unit,
        sourceType: 'MANUAL',
      });
    } else if (s.reason) {
      out.push({
        metric: s.key,
        value: null,
        unit: def.unit,
        sourceType: 'MANUAL',
        unmeasuredReason: s.reason,
      });
    }
  }
  return out;
}
