import type { SourceType } from '@/types/contract';

export type ObservationSourceKind = 'simulated' | 'mixed' | 'official' | 'manual' | 'unknown';

export interface ObservationSourceSummary {
  kind: ObservationSourceKind;
  code: string;
  label: string;
  desc: string;
}

const OFFICIAL_TYPES: SourceType[] = ['OFFICIAL_PUBLIC', 'OFFICIAL_AUTO'];

/** 按观测记录的真实 sourceType 归纳来源，避免把模拟序列标成“真实观测”。 */
export function summarizeObservationSource(
  items: { sourceType?: SourceType | string | null }[],
): ObservationSourceSummary {
  const types = new Set(
    items.map((item) => item.sourceType).filter((type): type is string => Boolean(type)),
  );
  if (types.size === 0) {
    return { kind: 'unknown', code: 'OBSERVATIONS', label: '观测记录', desc: '观测序列' };
  }
  const hasSimulated = types.has('SIMULATED');
  const hasOther = [...types].some((type) => type !== 'SIMULATED');
  if (hasSimulated && hasOther) {
    return { kind: 'mixed', code: 'MIXED', label: '含模拟观测', desc: '含模拟观测的序列' };
  }
  if (hasSimulated) {
    return { kind: 'simulated', code: 'SIMULATED', label: '模拟观测', desc: '模拟观测序列' };
  }
  if ([...types].every((type) => OFFICIAL_TYPES.includes(type as SourceType))) {
    return { kind: 'official', code: 'OFFICIAL', label: '官方观测', desc: '官方观测序列' };
  }
  if ([...types].every((type) => type === 'MANUAL')) {
    return { kind: 'manual', code: 'MANUAL', label: '人工实测', desc: '人工实测序列' };
  }
  return { kind: 'unknown', code: 'OBSERVATIONS', label: '观测记录', desc: '观测序列' };
}
